import json
import logging
import math
import os
import random
import re
import time
import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AIGenerationHistory, AIGenerationQuota, MembershipOrder, UserProfile
from .llm_providers import get_llm_provider
from .route_generator import RouteGenerator, RouteConfig
from .route_validator import RouteValidator
from .serializers import MAX_ROUTE_DATA_BYTES, _validate_json_data
from .services.payment_settlement import AI_QUOTA_PRICES
from .utils import ExternalServiceConfigError, create_alipay_order, parse_query_datetime
from .throttles import AIRateThrottle

logger = logging.getLogger(__name__)

# 配置常量
MAX_PROMPT_LENGTH = 500
MAX_LIMIT = 100
MAX_EDIT_OBSTACLES = 200
MAX_EDIT_POLES = 20
MAX_EDIT_FIELD_DIMENSION = 1000
MAX_GENERATED_OBSTACLES = 20
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_OBSTACLE_TYPES = {"SINGLE", "DOUBLE", "COMBINATION", "WALL", "LIVERPOOL", "WATER"}


def _ai_response(code, message=None, data=None):
    """创建 AI 接口统一响应信封。"""
    payload = {"success": code < 400, "code": code}
    if message is not None:
        payload["message"] = message
    if data is not None:
        payload["data"] = data
    return Response(payload, status=code)


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
                value = json.loads(chunk)
                return value if isinstance(value, dict) else None
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
                    value = json.loads(text[start_i : i + 1])
                    return value if isinstance(value, dict) else None
                except json.JSONDecodeError:
                    break
    return None


def _parse_integer(value, name, minimum=None, maximum=None):
    """解析整数输入，拒绝布尔值、小数和超出业务范围的数值。"""
    if isinstance(value, bool):
        raise ValueError(f"{name}必须是整数")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{name}必须是整数")
    if isinstance(value, str) and not re.fullmatch(r"[+-]?\d+", value.strip()):
        raise ValueError(f"{name}必须是整数")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name}必须是整数") from exc
    if minimum is not None and parsed < minimum:
        raise ValueError(f"{name}必须在{minimum}-{maximum}之间")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{name}必须在{minimum}-{maximum}之间")
    return parsed


def _normalize_ai_result(ai_result: dict) -> dict:
    """验证和规范 AI 返回的路线设计"""
    import uuid

    if not isinstance(ai_result, dict):
        raise TypeError("AI 结果必须是对象")
    obstacles = ai_result.get("obstacles", [])
    if not isinstance(obstacles, list) or len(obstacles) > MAX_GENERATED_OBSTACLES:
        raise ValueError(f"障碍物必须是数组且数量不超过{MAX_GENERATED_OBSTACLES}个")

    def _finite_number(value, name):
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name}必须是数字") from exc
        if not math.isfinite(number):
            raise ValueError(f"{name}必须是有限数字")
        return number

    field_width = min(max(_finite_number(ai_result.get("field_width", 90), "场地宽度"), 30), 150)
    field_height = min(max(_finite_number(ai_result.get("field_height", 60), "场地高度"), 30), 150)
    difficulty = ai_result.get("difficulty", "medium")
    if difficulty not in VALID_DIFFICULTIES:
        difficulty = "medium"

    validator = RouteValidator(field_width, field_height)

    normalized_obstacles = []
    for i, obs in enumerate(obstacles):
        if not isinstance(obs, dict):
            raise ValueError("障碍物必须是对象")
        obs_type = obs.get("type", "SINGLE")
        if obs_type not in VALID_OBSTACLE_TYPES:
            obs_type = "SINGLE"

        pos = obs.get("position", {})
        x = _finite_number(pos.get("x", 10), "障碍物横坐标")
        y = _finite_number(pos.get("y", 10), "障碍物纵坐标")

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


def _clone_course_obstacles(course: dict) -> list:
    """复制当前路线障碍物，避免直接修改请求对象。"""
    raw_obstacles = course.get("obstacles", [])
    if not isinstance(raw_obstacles, list):
        raise ValueError("障碍物必须是数组")
    if len(raw_obstacles) > MAX_EDIT_OBSTACLES:
        raise ValueError(f"障碍物数量不能超过{MAX_EDIT_OBSTACLES}个")

    try:
        obstacles = json.loads(json.dumps(raw_obstacles, ensure_ascii=False))
    except (TypeError, ValueError) as exc:
        raise ValueError("障碍物数据不是有效 JSON") from exc

    for index, obstacle in enumerate(obstacles):
        if not isinstance(obstacle, dict):
            raise ValueError(f"第{index + 1}个障碍物格式无效")

        position = obstacle.get("position")
        if not isinstance(position, dict) or "x" not in position or "y" not in position:
            raise ValueError(f"第{index + 1}个障碍物缺少有效位置")
        for coordinate in ("x", "y"):
            try:
                coordinate_value = float(position[coordinate])
            except (TypeError, ValueError, OverflowError) as exc:
                raise ValueError(f"第{index + 1}个障碍物位置无效") from exc
            if not math.isfinite(coordinate_value):
                raise ValueError(f"第{index + 1}个障碍物位置无效")

        poles = obstacle.get("poles") or []
        if not isinstance(poles, list) or len(poles) > MAX_EDIT_POLES:
            raise ValueError(f"第{index + 1}个障碍物横杆数据无效")
        for pole_index, pole in enumerate(poles):
            if not isinstance(pole, dict):
                raise ValueError(f"第{index + 1}个障碍物第{pole_index + 1}根横杆无效")
            for field in ("height", "width", "spacing"):
                if field not in pole or pole[field] is None:
                    continue
                try:
                    numeric_value = float(pole[field])
                except (TypeError, ValueError, OverflowError) as exc:
                    raise ValueError(f"横杆{field}必须是数字") from exc
                if not math.isfinite(numeric_value):
                    raise ValueError(f"横杆{field}必须是有限数字")

    return obstacles


def _parse_edit_field_dimension(value, default, field_name):
    """解析二次编辑的场地尺寸并限制资源范围。"""
    try:
        dimension = float(value or default)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name}必须是数字") from exc
    if not math.isfinite(dimension) or dimension <= 0 or dimension > MAX_EDIT_FIELD_DIMENSION:
        raise ValueError(f"{field_name}必须大于0且不超过{MAX_EDIT_FIELD_DIMENSION}")
    return int(dimension) if dimension.is_integer() else dimension


def _renumber_obstacles(obstacles: list) -> list:
    """按当前顺序重新编号障碍物。"""
    for index, obstacle in enumerate(obstacles):
        obstacle["number"] = str(index + 1)
    return obstacles


def _fallback_edit_course(course: dict, instruction: str) -> dict:
    """AI 不可用时的规则引擎二次编辑。"""
    obstacles = _clone_course_obstacles(course)
    field_width = _parse_edit_field_dimension(
        course.get("field_width") or course.get("fieldWidth"),
        90,
        "场地宽度",
    )
    field_height = _parse_edit_field_dimension(
        course.get("field_height") or course.get("fieldHeight"),
        60,
        "场地高度",
    )
    difficulty = course.get("difficulty") or "medium"
    change_summary = []

    if "降低" in instruction or "简单" in instruction:
        difficulty = "easy"
        for obstacle in obstacles:
            for pole in obstacle.get("poles", []):
                old_height = float(pole.get("height", 1.0))
                new_height = min(old_height, 1.0)
                if new_height != old_height:
                    pole["height"] = round(new_height, 2)
        change_summary.append("已将路线难度降低，并把横杆高度控制在初级范围内")

    if "提高" in instruction or "困难" in instruction:
        difficulty = "hard"
        for obstacle in obstacles:
            for pole in obstacle.get("poles", []):
                old_height = float(pole.get("height", 1.0))
                new_height = max(old_height, 1.2)
                if new_height != old_height:
                    pole["height"] = round(min(new_height, 1.4), 2)
        change_summary.append("已提高路线难度，并提升横杆高度")

    count_match = re.search(r"(\d+)\s*道", instruction)
    if count_match:
        target_count = min(max(int(count_match.group(1)), 1), 20)
        current_count = len(obstacles)
        if target_count < current_count:
            obstacles = obstacles[:target_count]
            change_summary.append(f"已将障碍数量减少到{target_count}道")
        elif target_count > current_count:
            generator = RouteGenerator()
            generated = generator.generate(
                RouteConfig(
                    field_width=field_width,
                    field_height=field_height,
                    obstacle_count=target_count - current_count,
                    difficulty=difficulty if difficulty in VALID_DIFFICULTIES else "medium",
                )
            )
            existing_ids = {obs.get("id") for obs in obstacles}
            for generated_obstacle in generated.get("obstacles", []):
                if generated_obstacle.get("id") in existing_ids:
                    generated_obstacle["id"] = f"edit_{random.randint(100000, 999999)}"
                obstacles.append(generated_obstacle)
            change_summary.append(f"已将障碍数量增加到{target_count}道")

    if "组合障碍" in instruction and not any(obs.get("type") == "COMBINATION" for obs in obstacles):
        obstacles.append(
            {
                "id": f"combo_{random.randint(100000, 999999)}",
                "number": str(len(obstacles) + 1),
                "type": "COMBINATION",
                "position": {"x": min(field_width - 8, 35), "y": min(field_height - 8, 30)},
                "rotation": 0,
                "poles": [
                    {"height": 1.0, "width": 3.5, "color": "#8B4513", "spacing": 0.7},
                    {"height": 1.05, "width": 3.5, "color": "#654321", "spacing": 0.7},
                    {"height": 1.1, "width": 3.5, "color": "#8B4513"},
                ],
            }
        )
        change_summary.append("已增加一道组合障碍")

    if "减少急转弯" in instruction or "减少转弯" in instruction:
        for index, obstacle in enumerate(obstacles):
            obstacle.setdefault("position", {})
            obstacle["position"]["x"] = round(10 + index * max(6, (field_width - 20) / max(1, len(obstacles))), 2)
            obstacle["position"]["y"] = round(field_height / 2, 2)
        change_summary.append("已将障碍调整为更平顺的推进路线")

    obstacles = _renumber_obstacles(obstacles)
    validator = RouteValidator(field_width=field_width, field_height=field_height)
    validation = validator.validate_course_structure(obstacles, difficulty=difficulty)
    path = _generate_path_from_obstacles(obstacles, field_width, field_height)
    if not change_summary:
        change_summary.append("已基于当前路线进行规则化微调")

    return {
        "source": "fallback",
        "field_width": field_width,
        "field_height": field_height,
        "difficulty": difficulty,
        "obstacles": obstacles,
        "path": path,
        "change_summary": change_summary,
        "validation": validation,
    }


def _build_rule_based_coach_notes(course: dict, validation: dict | None = None) -> dict:
    """根据路线和校验结果生成规则模板教练说明。"""
    obstacles = course.get("obstacles", [])
    if not isinstance(obstacles, list):
        raise ValueError("障碍物列表格式无效")
    if len(obstacles) > MAX_EDIT_OBSTACLES:
        raise ValueError(f"障碍物数量不能超过{MAX_EDIT_OBSTACLES}个")
    if any(
        not isinstance(obstacle, dict)
        or not isinstance(obstacle.get("type", "SINGLE"), str)
        for obstacle in obstacles
    ):
        raise ValueError("障碍物元素格式无效")
    obstacle_types = {obstacle.get("type", "SINGLE") for obstacle in obstacles}
    warnings = (validation or {}).get("warnings", []) or []
    issues = (validation or {}).get("issues", []) or []
    if not isinstance(warnings, list):
        warnings = []
    if not isinstance(issues, list):
        issues = []

    training_goals = ["建立稳定节奏和清晰路线记忆"]
    if "COMBINATION" in obstacle_types or "DOUBLE" in obstacle_types:
        training_goals.append("强化组合障碍前后的步幅控制")
    if len(obstacles) >= 10:
        training_goals.append("提升完整路线中的体能分配")

    rhythm_advice = [
        "进入第一道障碍前保持直线和均匀步频",
        "每两道障碍之间提前规划转弯线路",
    ]
    common_mistakes = [
        "接近障碍前临时拉慢导致起跳点不稳定",
        "转弯后没有及时回到直线导致马匹肩部外漂",
    ]
    coach_commands = ["看下一道", "保持节奏", "外方缰稳定", "落地后继续向前"]
    risk_focus = []
    if warnings or issues:
        risk_focus.append("重点关注规则检查中提示的距离、转弯或高度问题")
    if any("转弯" in str(item) for item in warnings + issues):
        risk_focus.append("急转弯处需要提前建立弯曲和外方支撑")
    if not risk_focus:
        risk_focus.append("路线整体风险可控，训练重点放在节奏一致性")

    return {
        "source": "fallback",
        "training_goals": training_goals,
        "rhythm_advice": rhythm_advice,
        "common_mistakes": common_mistakes,
        "coach_commands": coach_commands,
        "risk_focus": risk_focus,
    }


@extend_schema(
    request=OpenApiTypes.OBJECT,
    responses=OpenApiTypes.OBJECT,
    summary="AI 生成路线",
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIRateThrottle])
def generate_route(request):
    """AI 生成路线"""
    # 1. 获取并验证输入，避免无效请求占用配额或外部服务资源。
    raw_prompt = request.data.get("prompt", "")
    if not isinstance(raw_prompt, str):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "设计需求描述格式无效")
    if len(raw_prompt) > MAX_PROMPT_LENGTH:
        return _ai_response(
            status.HTTP_400_BAD_REQUEST,
            f"设计需求描述不能超过{MAX_PROMPT_LENGTH}个字符",
        )
    prompt = raw_prompt
    config_data = request.data.get("config", {}) or {}
    if not isinstance(config_data, dict):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "路线配置格式无效")

    if not prompt or not prompt.strip():
        return _ai_response(status.HTTP_400_BAD_REQUEST, "请输入设计需求描述")

    try:
        obstacle_count = _parse_integer(
            config_data.get("obstacle_count", 12),
            "障碍物数量",
            minimum=8,
            maximum=20,
        )
        difficulty = config_data.get("difficulty", "medium")
        if not isinstance(difficulty, str) or difficulty not in VALID_DIFFICULTIES:
            raise ValueError("难度必须是 easy、medium 或 hard")
        field_width = _parse_integer(
            config_data.get("field_width", 90),
            "场地宽度",
            minimum=30,
            maximum=150,
        )
        field_height = _parse_integer(
            config_data.get("field_height", 60),
            "场地高度",
            minimum=30,
            maximum=150,
        )
    except (TypeError, ValueError):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "路线配置格式无效")

    # 2. 只在短事务内预占一次配额，然后释放数据库锁再调用 LLM。
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    history = None
    quota = None
    with transaction.atomic():
        quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)
        quota = AIGenerationQuota.objects.select_for_update().get(pk=quota.pk)
        if quota.remaining_quota <= 0:
            return _ai_response(status.HTTP_403_FORBIDDEN, "配额不足，请购买后再试")
        quota.used_quota += 1
        quota.save(update_fields=["used_quota", "updated_at"])
        history = AIGenerationHistory.objects.create(
            user_profile=profile,
            prompt=prompt,
            status="pending",
            quota_used=1,
        )

    try:
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
        llm_response = None
        ai_result = None
        fallback_reason = None

        try:
            provider = get_llm_provider()
            llm_response = provider.generate(
                user_content, system_prompt=system_prompt, max_tokens=4000
            )
            ai_result = _extract_json_from_llm_response(llm_response.content)
        except Exception as exc:
            fallback_reason = "外部模型暂不可用"
            logger.warning(
                "LLM不可用，回退到规则引擎: reason=%s",
                type(exc).__name__,
            )

        # 6. 如果LLM返回了完整设计，使用它；否则回退到规则引擎。
        if isinstance(ai_result, dict) and ai_result.get("obstacles"):
            try:
                result = _normalize_ai_result(ai_result)
            except Exception as exc:
                fallback_reason = "LLM返回结果无法规范化"
                logger.warning(
                    "LLM结果校验失败，回退到规则引擎: reason=%s",
                    type(exc).__name__,
                )
                result = None
        else:
            result = None

        if result is None:
            if not fallback_reason:
                fallback_reason = "LLM未返回有效结果"
                logger.warning("%s，回退到规则引擎", fallback_reason)
            route_config = RouteConfig(
                field_width=field_width,
                field_height=field_height,
                obstacle_count=obstacle_count,
                difficulty=difficulty,
                include_combinations=True,
            )
            generator = RouteGenerator()
            fallback_result = generator.generate(route_config)
            ai_like_result = {
                "obstacles": fallback_result.get("obstacles", []),
                "field_width": field_width,
                "field_height": field_height,
                "difficulty": difficulty,
                "design_notes": fallback_result.get("explanation"),
            }
            result = _normalize_ai_result(ai_like_result)
            result["explanation"] = f"{result['explanation']}（规则引擎兜底：{fallback_reason}）"
            result["validation"]["source"] = "fallback"
            result["validation"]["fallback_reason"] = fallback_reason
        else:
            result["validation"]["source"] = "llm"
            result["validation"]["fallback_reason"] = ""

        # 8. 更新历史记录
        history.result = result
        history.token_used = llm_response.token_used if llm_response else 0
        history.model_name = llm_response.model if llm_response else "fallback"
        history.quota_used = 1
        token_price_per_1k = os.getenv("AI_TOKEN_PRICE_PER_1K", "0")
        try:
            price = Decimal(token_price_per_1k)
            history.cost = (price * Decimal(history.token_used) / Decimal(1000)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        except Exception:
            history.cost = Decimal("0.00")
        history.status = "success"
        history.save()

        quota.refresh_from_db()

        # 10. 返回结果
        return _ai_response(
            status.HTTP_200_OK,
            "生成成功",
            {
                "history_id": history.id,
                "obstacles": result["obstacles"],
                "path": result["path"],
                "difficulty_score": result["difficulty_score"],
                "estimated_time": result["estimated_time"],
                "explanation": result["explanation"],
                "teaching_notes": result["teaching_notes"],
                "validation": result["validation"],
                "metrics": result["metrics"],
                "remaining_quota": quota.remaining_quota,
            },
        )

    except Exception as e:
        logger.error("AI生成失败", exc_info=True)
        if history is not None:
            with transaction.atomic():
                # 只处理当前这条仍处于 pending 的历史记录，避免并发请求
                # 互相回滚对方已经占用的配额。
                locked_history = AIGenerationHistory.objects.select_for_update().get(
                    pk=history.pk
                )
                if locked_history.status == "pending":
                    locked_quota = AIGenerationQuota.objects.select_for_update().get(
                        pk=quota.pk
                    )
                    if locked_history.quota_used > 0 and locked_quota.used_quota > 0:
                        locked_quota.used_quota -= locked_history.quota_used
                        locked_quota.save(update_fields=["used_quota", "updated_at"])
                    locked_history.status = "failed"
                    locked_history.error_message = "生成失败，请稍后重试"
                    locked_history.quota_used = 0
                    locked_history.save(
                        update_fields=["status", "error_message", "quota_used"]
                    )

        return _ai_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "生成失败，请稍后重试")


@extend_schema(
    responses=OpenApiTypes.OBJECT,
    summary="获取 AI 配额",
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_ai_quota(request):
    """获取 AI 配额信息"""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)

    return _ai_response(
        status.HTTP_200_OK,
        data={
            "free_quota": quota.free_quota,
            "purchased_quota": quota.purchased_quota,
            "used_quota": quota.used_quota,
            "remaining_quota": quota.remaining_quota,
        },
    )


@extend_schema(
    request=OpenApiTypes.OBJECT,
    responses=OpenApiTypes.OBJECT,
    summary="购买 AI 配额",
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def purchase_ai_quota(request):
    """购买 AI 配额：创建一次性订单并返回支付宝支付链接。"""
    quota_amount = request.data.get("quota", 10)

    try:
        quota_amount = _parse_integer(
            quota_amount,
            "购买数量",
            minimum=1,
            maximum=max(AI_QUOTA_PRICES),
        )
    except ValueError:
        return _ai_response(status.HTTP_400_BAD_REQUEST, "购买数量无效")

    if quota_amount not in AI_QUOTA_PRICES:
        return _ai_response(status.HTTP_400_BAD_REQUEST, "购买数量必须是 10、30 或 100")

    price = AI_QUOTA_PRICES[quota_amount]
    order_id = f"AI{uuid.uuid4().hex}"
    subject = f"AI 路线生成次数包-{quota_amount}次"

    # 先落本地待支付订单，再调用支付宝，避免支付宝通知先于本地订单创建
    # 到达时找不到订单而丢失支付结果。
    order = MembershipOrder.objects.create(
        user=request.user,
        order_id=order_id,
        membership_plan=None,
        amount=price,
        payment_channel="alipay",
        status="pending",
        billing_cycle="month",
    )

    try:
        payment_url = create_alipay_order(
            order_id=order_id,
            subject=subject,
            total_amount=float(price),
        )
    except ExternalServiceConfigError as exc:
        logger.warning("AI配额购买不可用: reason=%s", type(exc).__name__)
        # 配置未就绪时没有真正提交第三方订单，不保留一条用户无法继续
        # 支付的本地订单，避免订单列表出现不可操作的脏记录。
        order.delete()
        return _ai_response(status.HTTP_503_SERVICE_UNAVAILABLE, "支付功能暂不可用，请稍后重试")
    except Exception:
        logger.exception("创建 AI 配额支付宝订单失败")
        return _ai_response(status.HTTP_503_SERVICE_UNAVAILABLE, "支付功能暂不可用，请稍后重试")

    try:
        order.payment_url = payment_url
        order.save(update_fields=["payment_url", "updated_at"])
    except Exception:
        logger.exception("保存 AI 配额支付宝订单链接失败")
        return _ai_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "支付订单已创建，但本地状态暂未保存，请稍后查询订单",
            {"order_id": order_id},
        )

    return _ai_response(
        status.HTTP_200_OK,
        "订单创建成功",
        {
            "order_id": order.order_id,
            "amount": str(price),
            "quota_count": quota_amount,
            "payment_url": payment_url,
        },
    )


@extend_schema(
    responses=OpenApiTypes.OBJECT,
    summary="获取 AI 生成历史",
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_ai_history(request):
    """获取 AI 生成历史"""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    limit = request.query_params.get("limit", 20)

    try:
        limit = max(0, min(int(limit), MAX_LIMIT))
    except (ValueError, TypeError):
        limit = 20

    histories = AIGenerationHistory.objects.filter(user_profile=profile)
    status_filter = request.query_params.get("status")
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")
    try:
        start_at = parse_query_datetime(start_date)
    except ValueError as exc:
        return _ai_response(
            status.HTTP_400_BAD_REQUEST,
            data={"start_date": [str(exc)]},
        )
    try:
        end_at = parse_query_datetime(end_date, end_of_day=True)
    except ValueError as exc:
        return _ai_response(
            status.HTTP_400_BAD_REQUEST,
            data={"end_date": [str(exc)]},
        )
    if start_at and end_at and start_at > end_at:
        return _ai_response(
            status.HTTP_400_BAD_REQUEST,
            data={"date_range": ["开始日期不能晚于结束日期"]},
        )
    if status_filter:
        histories = histories.filter(status=status_filter)
    if start_at:
        histories = histories.filter(created_at__gte=start_at)
    if end_at:
        histories = histories.filter(created_at__lte=end_at)
    histories = histories.order_by("-created_at")[:limit]

    return _ai_response(
        status.HTTP_200_OK,
        data={
            "histories": [
                {
                    "id": h.id,
                    "prompt": h.prompt,
                    "status": h.status,
                    "token_used": h.token_used,
                    "quota_used": h.quota_used,
                    "model_name": h.model_name or "",
                    "error_message": h.error_message or "",
                    "created_at": h.created_at.isoformat()
                    if h.created_at
                    else None,
                }
                for h in histories
            ]
        },
    )


@extend_schema(
    request=OpenApiTypes.OBJECT,
    responses=OpenApiTypes.OBJECT,
    summary="AI 二次编辑路线",
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIRateThrottle])
def edit_course(request):
    """基于当前路线进行 AI/规则二次编辑。"""
    raw_instruction = request.data.get("instruction")
    if raw_instruction is not None and not isinstance(raw_instruction, str):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "修改指令格式无效")
    instruction = (raw_instruction or "").strip()[:MAX_PROMPT_LENGTH]
    course = request.data.get("course")
    if course is None:
        course = {}
    if not instruction:
        return _ai_response(status.HTTP_400_BAD_REQUEST, "请输入修改指令")
    if not isinstance(course, dict):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "路线数据无效")
    try:
        _validate_json_data(course, MAX_ROUTE_DATA_BYTES, "路线数据")
    except serializers.ValidationError as exc:
        return _ai_response(status.HTTP_400_BAD_REQUEST, str(exc.detail[0]))

    # 当前实现优先使用规则兜底，后续可接入 LLM JSON patch。
    try:
        result = _fallback_edit_course(course, instruction)
    except (IndexError, KeyError, OverflowError, TypeError, ValueError) as exc:
        return _ai_response(status.HTTP_400_BAD_REQUEST, str(exc) or "路线数据无效")
    return _ai_response(status.HTTP_200_OK, "编辑成功", result)


@extend_schema(
    request=OpenApiTypes.OBJECT,
    responses=OpenApiTypes.OBJECT,
    summary="生成教练说明",
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIRateThrottle])
def coach_notes(request):
    """根据当前路线生成教练说明。"""
    course = request.data.get("course")
    validation = request.data.get("validation")
    if course is None:
        course = {}
    if validation is None:
        validation = {}
    if not isinstance(course, dict):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "路线数据无效")
    if not isinstance(validation, dict):
        return _ai_response(status.HTTP_400_BAD_REQUEST, "校验结果格式无效")
    try:
        _validate_json_data(course, MAX_ROUTE_DATA_BYTES, "路线数据")
        _validate_json_data(validation, MAX_ROUTE_DATA_BYTES, "校验结果")
    except serializers.ValidationError as exc:
        return _ai_response(status.HTTP_400_BAD_REQUEST, str(exc.detail[0]))
    try:
        notes = _build_rule_based_coach_notes(course, validation)
    except ValueError as exc:
        return _ai_response(status.HTTP_400_BAD_REQUEST, str(exc))
    return _ai_response(status.HTTP_200_OK, "生成成功", notes)
