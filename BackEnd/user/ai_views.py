from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import F
from django.db import transaction
import logging
import json
import re
import random
import time

from .models import AIGenerationQuota, AIGenerationHistory, MembershipOrder
from .llm_providers import get_llm_provider
from .route_generator import RouteGenerator, RouteConfig
from .route_validator import RouteValidator

logger = logging.getLogger(__name__)

# 价格配置
AI_QUOTA_PRICES = {10: 9.90, 30: 24.90, 100: 69.90}

# 配置常量
MAX_PROMPT_LENGTH = 500
MAX_LIMIT = 100
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_OBSTACLE_TYPES = {"SINGLE", "DOUBLE", "COMBINATION", "WALL", "LIVERPOOL", "WATER"}


def _extract_json_from_llm_response(content: str) -> dict | None:
    if not content or not content.strip():
        return None
    text = content.strip()
    for marker in ("```json", "```"):
        if marker in text:
            start = text.find(marker) + len(marker)
            end = text.find("```", start)
            if end == -1:
                end = len(text)
            chunk = text[start:end].strip()
            try:
                return json.loads(chunk)
            except json.JSONDecodeError:
                pass
    depth = 0
    start_i = text.find("{")
    if start_i == -1:
        return None
    for i in range(start_i, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start_i : i + 1])
                except json.JSONDecodeError:
                    break
    return None


def _normalize_ai_result(ai_result: dict) -> dict:
    """验证和规范 AI 返回的路线设计"""
    import uuid

    obstacles = ai_result.get("obstacles", [])
    field_width = min(max(ai_result.get("field_width", 90), 30), 150)
    field_height = min(max(ai_result.get("field_height", 60), 30), 150)
    difficulty = ai_result.get("difficulty", "medium")
    if difficulty not in VALID_DIFFICULTIES:
        difficulty = "medium"

    validator = RouteValidator(field_width, field_height)

    normalized_obstacles = []
    for i, obs in enumerate(obstacles):
        obs_type = obs.get("type", "SINGLE")
        if obs_type not in VALID_OBSTACLE_TYPES:
            obs_type = "SINGLE"

        pos = obs.get("position", {})
        x = float(pos.get("x", 10))
        y = float(pos.get("y", 10))

        x = max(5, min(field_width - 5, x))
        y = max(5, min(field_height - 5, y))

        rotation = int(obs.get("rotation", 0)) % 360
        rotation = [0, 90, 180, 270][rotation // 90 % 4]

        poles = obs.get("poles", [{"height": 1.4, "width": 3.5, "color": "#8B4513"}])

        normalized_obstacles.append(
            {
                "id": str(uuid.uuid4()),
                "type": obs_type,
                "position": {"x": round(x, 2), "y": round(y, 2)},
                "rotation": rotation,
                "number": str(obs.get("number", i + 1)),
                "poles": poles,
                "wallProperties": obs.get("wallProperties"),
                "liverpoolProperties": obs.get("liverpoolProperties"),
                "waterProperties": obs.get("waterProperties"),
            }
        )

    def _route_order(o):
        n = o.get("number", "999")
        try:
            return (0, int(n))
        except (ValueError, TypeError):
            return (1, o["position"]["x"], o["position"]["y"])

    normalized_obstacles.sort(key=_route_order)
    for i, o in enumerate(normalized_obstacles):
        o["number"] = str(i + 1)

    optimized_obstacles, validation_result = validator.validate_and_optimize(
        normalized_obstacles, difficulty
    )

    if validation_result.auto_fixed:
        logger.info(f"路线自动修正: {validation_result.auto_fixed}")
    if validation_result.issues:
        logger.warning(f"路线问题: {validation_result.issues}")
    if validation_result.warnings:
        logger.info(f"路线建议: {validation_result.warnings}")

    for i, obs in enumerate(optimized_obstacles):
        obs["id"] = str(uuid.uuid4())
        obs["number"] = str(i + 1)

    path_data = _generate_path_from_obstacles(
        optimized_obstacles, field_width, field_height
    )

    metrics = validator.calculate_route_metrics(optimized_obstacles)

    explanation = ai_result.get(
        "design_notes", f"AI生成了{len(optimized_obstacles)}个障碍物的路线设计"
    )
    if validation_result.auto_fixed:
        explanation += f"。已自动修正{len(validation_result.auto_fixed)}处问题。"

    teaching_notes = _generate_teaching_notes(
        optimized_obstacles, difficulty, validation_result
    )

    return {
        "obstacles": optimized_obstacles,
        "path": path_data,
        "difficulty_score": metrics["difficulty_score"],
        "estimated_time": int(metrics["total_distance"] / 350 * 60),
        "explanation": explanation,
        "teaching_notes": teaching_notes,
        "validation": {
            "is_valid": validation_result.is_valid,
            "issues": validation_result.issues,
            "warnings": validation_result.warnings,
            "auto_fixed": validation_result.auto_fixed,
        },
        "metrics": metrics,
    }


def _generate_teaching_notes(
    obstacles: list, difficulty: str, validation_result
) -> str:
    """生成教学建议"""
    notes = []

    difficulty_notes = {
        "easy": "适合初学者训练基础节奏感和平衡控制",
        "medium": "适合中级骑手提升技术水平和路线规划能力",
        "hard": "适合高级骑手挑战极限，考验精准度和勇气",
    }
    notes.append(difficulty_notes.get(difficulty, "根据难度进行针对性训练"))

    types = [o.get("type", "SINGLE") for o in obstacles]
    if "COMBINATION" in types:
        notes.append("组合障碍需要精准的节奏控制，建议提前规划起跳点")
    if "LIVERPOOL" in types:
        notes.append("利物浦障碍的水池可能让马匹紧张，注意安抚和引导")
    if "WALL" in types:
        notes.append("砖墙是视觉障碍，需要马匹的信任和勇气")
    if "WATER" in types:
        notes.append("水障需要良好的接近角度和足够的动力")

    if validation_result.warnings:
        notes.append(f"注意: {validation_result.warnings[0]}")

    return " | ".join(notes)


def _generate_path_from_obstacles(
    obstacles: list, field_width: float, field_height: float
) -> dict:
    """根据障碍物生成平滑的骑行路径（使用贝塞尔曲线）"""
    import math

    if not obstacles:
        return {"visible": False, "points": [], "startPoint": {}, "endPoint": {}}

    def get_approach_angle(rotation: int) -> float:
        """根据障碍物旋转角度计算马的接近方向（弧度）"""
        return (rotation - 270) * (math.pi / 180)

    def calculate_control_points(
        p0: dict, p1: dict, p2: dict, tension: float = 0.3
    ) -> tuple:
        d01 = math.sqrt((p1["x"] - p0["x"]) ** 2 + (p1["y"] - p0["y"]) ** 2)
        d12 = math.sqrt((p2["x"] - p1["x"]) ** 2 + (p2["y"] - p1["y"]) ** 2)

        if d01 < 0.01 or d12 < 0.01:
            return None, None

        v1 = (p1["x"] - p0["x"], p1["y"] - p0["y"])
        v2 = (p2["x"] - p1["x"], p2["y"] - p1["y"])
        dot = v1[0] * v2[0] + v1[1] * v2[1]
        mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
        mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
        if mag1 > 1e-6 and mag2 > 1e-6:
            cos_a = max(-1, min(1, dot / (mag1 * mag2)))
            angle_deg = math.degrees(math.acos(cos_a))
            if angle_deg > 100:
                tension = 0.15

        fa = tension * d01 / (d01 + d12)
        fb = tension * d12 / (d01 + d12)

        cp1 = {
            "x": p1["x"] - fa * (p2["x"] - p0["x"]),
            "y": p1["y"] - fa * (p2["y"] - p0["y"]),
        }
        cp2 = {
            "x": p1["x"] + fb * (p2["x"] - p0["x"]),
            "y": p1["y"] + fb * (p2["y"] - p0["y"]),
        }

        return cp1, cp2

    waypoints = []

    first_obs = obstacles[0]
    first_angle = get_approach_angle(first_obs["rotation"])
    start_x = first_obs["position"]["x"] + math.cos(first_angle) * 8
    start_y = first_obs["position"]["y"] + math.sin(first_angle) * 8
    waypoints.append({"x": round(start_x, 2), "y": round(start_y, 2)})

    for obs in obstacles:
        waypoints.append({"x": obs["position"]["x"], "y": obs["position"]["y"]})

    last_obs = obstacles[-1]
    last_angle = get_approach_angle(last_obs["rotation"])
    end_x = last_obs["position"]["x"] - math.cos(last_angle) * 8
    end_y = last_obs["position"]["y"] - math.sin(last_angle) * 8
    waypoints.append({"x": round(end_x, 2), "y": round(end_y, 2)})

    smooth_path = []
    smooth_path.append(waypoints[0])

    for i in range(1, len(waypoints) - 1):
        prev_point = waypoints[i - 1]
        curr_point = waypoints[i]
        next_point = waypoints[i + 1]

        cp1, cp2 = calculate_control_points(prev_point, curr_point, next_point)

        if cp1 and cp2:
            smooth_path.append(
                {
                    "x": round(curr_point["x"], 2),
                    "y": round(curr_point["y"], 2),
                    "controlPoint1": {"x": round(cp1["x"], 2), "y": round(cp1["y"], 2)},
                    "controlPoint2": {"x": round(cp2["x"], 2), "y": round(cp2["y"], 2)},
                }
            )
        else:
            smooth_path.append(curr_point)

    smooth_path.append(waypoints[-1])

    return {
        "visible": True,
        "points": smooth_path,
        "waypoints": waypoints,
        "startPoint": {
            "x": round(start_x, 2),
            "y": round(start_y, 2),
            "rotation": first_obs["rotation"],
        },
        "endPoint": {
            "x": round(end_x, 2),
            "y": round(end_y, 2),
            "rotation": (last_obs["rotation"] + 180) % 360,
        },
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def generate_route(request):
    """AI 生成路线"""
    # 1. 获取用户资料和配额（使用 select_for_update 锁定行）
    profile = request.user.profile

    try:
        quota = AIGenerationQuota.objects.select_for_update().get(user_profile=profile)
    except AIGenerationQuota.DoesNotExist:
        quota = AIGenerationQuota.objects.create(user_profile=profile, free_quota=3)

    # 2. 检查配额
    if quota.remaining_quota <= 0:
        return Response(
            {"code": status.HTTP_403_FORBIDDEN, "message": "配额不足，请购买后再试"}
        )

    # 3. 获取用户输入并验证
    prompt = request.data.get("prompt", "")[:MAX_PROMPT_LENGTH]
    config_data = request.data.get("config", {}) or {}

    if not prompt or not prompt.strip():
        return Response(
            {"code": status.HTTP_400_BAD_REQUEST, "message": "请输入设计需求描述"}
        )

        # 4. 创建历史记录
    history = AIGenerationHistory.objects.create(
        user_profile=profile, prompt=prompt, status="pending"
    )

    try:
        obstacle_count = min(max(int(config_data.get("obstacle_count", 12)), 8), 20)
        difficulty = config_data.get("difficulty", "medium")
        if difficulty not in VALID_DIFFICULTIES:
            difficulty = "medium"
        field_width = min(max(int(config_data.get("field_width", 90)), 30), 150)
        field_height = min(max(int(config_data.get("field_height", 60)), 30), 150)

        provider = get_llm_provider()
        system_prompt = """你是一位资深的马术障碍赛路线设计师，拥有FEI（国际马联）认证资格。你需要根据用户需求设计专业、安全、有挑战性的障碍赛路线。

## 场地坐标系
- 场地宽度90米，高度60米（标准马术场地）
- 左上角为原点(0,0)，x向右增加，y向下增加
- 障碍物位置用{x, y}表示中心点坐标
- rotation表示障碍物横杆朝向：0=水平横杆(马向上跳), 90=垂直横杆(马向右跳), 180=水平横杆(马向下跳), 270=垂直横杆(马向左跳)

## FEI专业规则（必须严格遵守）

### 1. 障碍物间距要求
- 相邻障碍物最小间距：6米（小型场地可适当减少至5米）
- 组合障碍内部间距：双横杆0.7-1米，三横杆0.6-0.8米
- 障碍物距场地边界：至少3米安全距离

### 2. 骑行路线原则
- 路线应流畅自然，避免急转弯（转弯半径不小于6米）
- 马匹通常以逆时针方向跑步，设计时优先考虑左转弯路线
- 障碍物应面向马匹接近方向，横杆与骑行方向垂直
- 连续跳跃时，障碍物朝向应保持一致或平滑过渡

### 3. 障碍物高度递进
- 初级路线：0.8-1.0米
- 中级路线：1.0-1.2米
- 高级路线：1.2-1.4米
- 同一路线中，障碍物高度应从低到高逐渐递进

### 4. 障碍物类型分布
- SINGLE（单横杆）：基础障碍，适合入门
- DOUBLE（双横杆）：需要良好的节奏控制
- COMBINATION（组合障碍）：2-3道连续障碍，考验精准度
- WALL（砖墙）：视觉障碍，需要勇气
- LIVERPOOL（利物浦）：带水池的障碍
- WATER（水障）：大型水池障碍

### 5. 难度设计原则
- easy：以SINGLE为主(70%)，少量DOUBLE(30%)，高度0.8-1.0米
- medium：SINGLE(50%)、DOUBLE(30%)、COMBINATION(10%)、LIVERPOOL(10%)，高度1.0-1.2米
- hard：SINGLE(30%)、DOUBLE(25%)、COMBINATION(20%)、WALL(10%)、LIVERPOOL(15%)，高度1.2-1.4米

## 返回格式（JSON）
```json
{
    "obstacles": [
        {
            "id": "obs_1",
            "type": "SINGLE",
            "position": {"x": 15, "y": 20},
            "rotation": 0,
            "number": "1",
            "poles": [{"height": 0.9, "width": 3.5, "color": "#8B4513"}],
            "wallProperties": null,
            "liverpoolProperties": null,
            "waterProperties": null
        }
    ],
    "difficulty": "easy",
    "field_width": 90,
    "field_height": 60,
    "design_notes": "设计说明"
}
```

## 关键要求
1. 障碍物必须按骑行顺序编号（1, 2, 3...）
2. 相邻障碍物间距必须≥6米
3. 障碍物rotation必须与马的接近方向垂直
4. 高度设置必须符合难度等级
5. 只返回JSON，不要其他内容。"""

        user_content = f"{prompt}\n\n当前配置：障碍物数量 {obstacle_count} 个，难度 {difficulty}，场地 {field_width}x{field_height} 米。请严格按此配置生成，只返回JSON。"
        llm_response = provider.generate(
            user_content, system_prompt=system_prompt, max_tokens=4000
        )

        ai_result = _extract_json_from_llm_response(llm_response.content)

        # 6. 如果LLM返回了完整设计，使用它；否则回退到规则引擎
        if ai_result and ai_result.get("obstacles"):
            # 验证和规范化AI返回的数据
            result = _normalize_ai_result(ai_result)
        else:
            logger.warning("LLM未返回有效结果，回退到规则引擎")
            route_config = RouteConfig(
                field_width=field_width,
                field_height=field_height,
                obstacle_count=obstacle_count,
                difficulty=difficulty,
                include_combinations=True,
            )
            generator = RouteGenerator()
            result = generator.generate(route_config)

        # 8. 更新历史记录
        history.result = result
        history.token_used = llm_response.token_used
        history.status = "success"
        history.save()

        # 9. 原子扣减配额
        quota.used_quota = F("used_quota") + 1
        quota.save()
        quota.refresh_from_db()

        # 10. 返回结果
        return Response(
            {
                "code": status.HTTP_200_OK,
                "message": "生成成功",
                "data": {
                    "history_id": history.id,
                    "obstacles": result["obstacles"],
                    "path": result["path"],
                    "difficulty_score": result["difficulty_score"],
                    "estimated_time": result["estimated_time"],
                    "explanation": result["explanation"],
                    "teaching_notes": result["teaching_notes"],
                    "remaining_quota": quota.remaining_quota,
                },
            }
        )

    except Exception as e:
        logger.error(f"AI生成失败: {str(e)}", exc_info=True)
        history.status = "failed"
        history.error_message = "生成失败，请稍后重试"
        history.save()

        return Response(
            {
                "code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                "message": "生成失败，请稍后重试",
            }
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_ai_quota(request):
    """获取 AI 配额信息"""
    profile = request.user.profile
    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)

    return Response(
        {
            "code": status.HTTP_200_OK,
            "data": {
                "free_quota": quota.free_quota,
                "purchased_quota": quota.purchased_quota,
                "used_quota": quota.used_quota,
                "remaining_quota": quota.remaining_quota,
            },
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def purchase_ai_quota(request):
    """购买 AI 配额"""
    quota_amount = request.data.get("quota", 10)

    # 验证配额数量
    try:
        quota_amount = int(quota_amount)
        if quota_amount <= 0 or quota_amount > 1000:
            raise ValueError("Invalid quota amount")
    except (ValueError, TypeError):
        return Response(
            {"code": status.HTTP_400_BAD_REQUEST, "message": "购买数量无效"}
        )

    price = AI_QUOTA_PRICES.get(quota_amount, quota_amount * 1.0)

    # 创建订单
    order = MembershipOrder.objects.create(
        user=request.user,
        order_id=f"AI{int(time.time())}{random.randint(1000, 9999)}",
        membership_plan=None,
        amount=price,
        payment_channel="alipay",
        status="pending",
        billing_cycle="one_time",
        note=f"AI生成次数 x {quota_amount}",
    )

    return Response(
        {
            "code": status.HTTP_200_OK,
            "message": "订单创建成功",
            "data": {
                "order_id": order.order_id,
                "amount": str(price),
                "quota_count": quota_amount,
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_ai_history(request):
    """获取 AI 生成历史"""
    profile = request.user.profile
    limit = request.query_params.get("limit", 20)

    try:
        limit = min(int(limit), MAX_LIMIT)
    except (ValueError, TypeError):
        limit = 20

    histories = AIGenerationHistory.objects.filter(user_profile=profile).order_by(
        "-created_at"
    )[:limit]

    return Response(
        {
            "code": status.HTTP_200_OK,
            "data": {
                "histories": [
                    {
                        "id": h.id,
                        "prompt": h.prompt,
                        "status": h.status,
                        "token_used": h.token_used,
                        "created_at": h.created_at.isoformat()
                        if h.created_at
                        else None,
                    }
                    for h in histories
                ]
            },
        }
    )
