"""
路线验证和优化模块
根据FEI规则验证和优化AI生成的障碍赛路线
"""
import math
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """验证结果"""
    is_valid: bool
    issues: List[str]
    warnings: List[str]
    auto_fixed: List[str]


@dataclass
class DifficultyConfig:
    """难度配置"""
    name: str
    min_height: float
    max_height: float
    type_distribution: Dict[str, float]


DIFFICULTY_CONFIGS = {
    'easy': DifficultyConfig(
        name='easy',
        min_height=0.8,
        max_height=1.0,
        type_distribution={'SINGLE': 0.7, 'DOUBLE': 0.3}
    ),
    'medium': DifficultyConfig(
        name='medium',
        min_height=1.0,
        max_height=1.2,
        type_distribution={'SINGLE': 0.5, 'DOUBLE': 0.3, 'COMBINATION': 0.1, 'LIVERPOOL': 0.1}
    ),
    'hard': DifficultyConfig(
        name='hard',
        min_height=1.2,
        max_height=1.4,
        type_distribution={'SINGLE': 0.3, 'DOUBLE': 0.25, 'COMBINATION': 0.2, 'WALL': 0.1, 'LIVERPOOL': 0.15}
    )
}

FEI_RULES = {
    'min_obstacle_distance': 6.0,
    'min_boundary_distance': 3.0,
    'min_turn_radius': 6.0,
    'combination_spacing': {
        'DOUBLE': (0.7, 1.0),
        'COMBINATION': (0.6, 0.8)
    }
}


class RouteValidator:
    """路线验证器"""

    def __init__(self, field_width: float = 90, field_height: float = 60):
        self.field_width = field_width
        self.field_height = field_height

    def validate_and_optimize(
        self,
        obstacles: List[Dict[str, Any]],
        difficulty: str = 'medium'
    ) -> Tuple[List[Dict[str, Any]], ValidationResult]:
        """验证并优化路线"""
        issues = []
        warnings = []
        auto_fixed = []

        if not obstacles:
            return obstacles, ValidationResult(
                is_valid=False,
                issues=['路线中没有障碍物'],
                warnings=[],
                auto_fixed=[]
            )

        config = DIFFICULTY_CONFIGS.get(difficulty, DIFFICULTY_CONFIGS['medium'])

        optimized = []
        for i, obs in enumerate(obstacles):
            fixed_obs = obs.copy()

            fix_messages = []

            fixed_obs = self._fix_position(fixed_obs, i, fix_messages)
            fixed_obs = self._fix_rotation(fixed_obs, i, fix_messages)
            fixed_obs = self._fix_height(fixed_obs, config, i, fix_messages)
            fixed_obs = self._fix_poles(fixed_obs, fix_messages)

            auto_fixed.extend(fix_messages)
            optimized.append(fixed_obs)

        # 保留原始编号顺序，只根据路径方向修正旋转
        self._set_rotation_from_path_direction(optimized)
        for i, o in enumerate(optimized):
            o["number"] = str(i + 1)

        optimized, distance_issues = self._fix_distances(optimized)
        issues.extend(distance_issues)

        optimized, direction_warnings = self._check_route_direction(optimized)
        warnings.extend(direction_warnings)

        is_valid = len(issues) == 0

        return optimized, ValidationResult(
            is_valid=is_valid,
            issues=issues,
            warnings=warnings,
            auto_fixed=auto_fixed
        )

    def _reorder_obstacles_to_reduce_turns(
        self,
        obstacles: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if len(obstacles) <= 1:
            return obstacles
        margin = FEI_RULES['min_boundary_distance']
        start = (margin, margin)
        used = set()
        result = []
        current = start
        for _ in range(len(obstacles)):
            best_idx = None
            best_dist = float('inf')
            for i, obs in enumerate(obstacles):
                if i in used:
                    continue
                pos = obs.get('position', {})
                x, y = pos.get('x', 0), pos.get('y', 0)
                d = math.sqrt((x - current[0]) ** 2 + (y - current[1]) ** 2)
                if d < best_dist:
                    best_dist = d
                    best_idx = i
            if best_idx is None:
                break
            used.add(best_idx)
            obs = obstacles[best_idx]
            result.append(obs)
            pos = obs.get('position', {})
            current = (pos.get('x', 0), pos.get('y', 0))
        return result if len(result) == len(obstacles) else obstacles

    def _set_rotation_from_path_direction(
        self,
        obstacles: List[Dict[str, Any]]
    ) -> None:
        if len(obstacles) <= 0:
            return
        n = len(obstacles)
        for i in range(n):
            if i == 0 and n > 1:
                p0 = obstacles[1].get('position', {})
                p1 = obstacles[0].get('position', {})
            elif i >= 1:
                p0 = obstacles[i - 1].get('position', {})
                p1 = obstacles[i].get('position', {})
            else:
                continue
            dx = p1.get('x', 0) - p0.get('x', 0)
            dy = p1.get('y', 0) - p0.get('y', 0)
            if abs(dx) < 1e-6 and abs(dy) < 1e-6:
                continue
            approach_deg = math.degrees(math.atan2(dy, dx))
            r = round((270 + approach_deg) / 90) * 90 % 360
            if r == 360:
                r = 0
            obstacles[i]['rotation'] = int(r)

    def _fix_position(
        self,
        obstacle: Dict[str, Any],
        index: int,
        fix_messages: List[str]
    ) -> Dict[str, Any]:
        """修正障碍物位置"""
        pos = obstacle.get('position', {})
        x = float(pos.get('x', 0))
        y = float(pos.get('y', 0))

        original_x, original_y = x, y

        margin = FEI_RULES['min_boundary_distance']
        x = max(margin, min(self.field_width - margin, x))
        y = max(margin, min(self.field_height - margin, y))

        if abs(x - original_x) > 0.1 or abs(y - original_y) > 0.1:
            fix_messages.append(
                f"障碍物{index + 1}位置从({original_x:.1f}, {original_y:.1f})修正为({x:.1f}, {y:.1f})"
            )

        obstacle['position'] = {'x': round(x, 2), 'y': round(y, 2)}
        return obstacle

    def _fix_rotation(
        self,
        obstacle: Dict[str, Any],
        index: int,
        fix_messages: List[str]
    ) -> Dict[str, Any]:
        """修正障碍物旋转角度"""
        rotation = obstacle.get('rotation', 0)

        if not isinstance(rotation, (int, float)):
            rotation = 0

        rotation = int(rotation) % 360
        original_rotation = rotation
        rotation = [0, 90, 180, 270][rotation // 90 % 4]

        if rotation != original_rotation:
            fix_messages.append(
                f"障碍物{index + 1}旋转角度从{original_rotation}°修正为{rotation}°"
            )

        obstacle['rotation'] = rotation
        return obstacle

    def _fix_height(
        self,
        obstacle: Dict[str, Any],
        config: DifficultyConfig,
        index: int,
        fix_messages: List[str]
    ) -> Dict[str, Any]:
        """修正障碍物高度"""
        poles = obstacle.get('poles', [])
        if not poles:
            poles = [{'height': config.min_height, 'width': 3.5, 'color': '#8B4513'}]
            obstacle['poles'] = poles

        height_progress = min(1.0, index / max(1, 10))
        target_height = config.min_height + (config.max_height - config.min_height) * height_progress

        for j, pole in enumerate(poles):
            original_height = pole.get('height', 1.0)
            height = float(original_height)

            if height < config.min_height or height > config.max_height:
                height = target_height
                if abs(height - original_height) > 0.05:
                    fix_messages.append(
                        f"障碍物{index + 1}横杆{j + 1}高度从{original_height:.2f}m修正为{height:.2f}m"
                    )

            pole['height'] = round(height, 2)
            if 'width' not in pole:
                pole['width'] = 3.5
            if 'color' not in pole:
                pole['color'] = '#8B4513'

        return obstacle

    def _fix_poles(
        self,
        obstacle: Dict[str, Any],
        fix_messages: List[str]
    ) -> Dict[str, Any]:
        """根据障碍物类型修正横杆配置"""
        obs_type = obstacle.get('type', 'SINGLE')
        poles = obstacle.get('poles', [])

        if obs_type == 'DOUBLE' and len(poles) < 2:
            poles = [
                {'height': 1.0, 'width': 3.5, 'color': '#8B4513', 'spacing': 0.7},
                {'height': 1.1, 'width': 3.5, 'color': '#654321'}
            ]
            fix_messages.append(f"双横杆障碍物横杆数量已修正为2根")

        elif obs_type == 'COMBINATION' and len(poles) < 3:
            poles = [
                {'height': 0.9, 'width': 3.5, 'color': '#8B4513', 'spacing': 0.6},
                {'height': 1.0, 'width': 3.5, 'color': '#654321', 'spacing': 0.6},
                {'height': 1.1, 'width': 3.5, 'color': '#8B4513'}
            ]
            fix_messages.append(f"组合障碍横杆数量已修正为3根")

        obstacle['poles'] = poles
        return obstacle

    def _fix_distances(
        self,
        obstacles: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """检查并尽量拉开相邻障碍物间距"""
        issues: List[str] = []
        min_distance = FEI_RULES['min_obstacle_distance']
        margin = FEI_RULES['min_boundary_distance']

        if len(obstacles) < 2:
            return obstacles, issues

        for i in range(len(obstacles) - 1):
            pos1 = obstacles[i].get('position', {})
            pos2 = obstacles[i + 1].get('position', {})

            x1, y1 = float(pos1.get('x', 0)), float(pos1.get('y', 0))
            x2, y2 = float(pos2.get('x', 0)), float(pos2.get('y', 0))

            dx = x2 - x1
            dy = y2 - y1
            distance = math.sqrt(dx * dx + dy * dy)

            if distance < 1e-3:
                # 完全重合时，沿水平方向尝试拉开
                x2 = x1 + min_distance
                y2 = y1
            elif distance < min_distance:
                # 沿当前连线方向把后一个障碍往外推
                need = min_distance - distance
                ux = dx / distance
                uy = dy / distance
                x2 = x2 + ux * need
                y2 = y2 + uy * need

            # 场地边界裁剪
            x2 = max(margin, min(self.field_width - margin, x2))
            y2 = max(margin, min(self.field_height - margin, y2))

            # 写回位置
            obstacles[i + 1]['position'] = {'x': round(x2, 2), 'y': round(y2, 2)}

            # 重新计算间距，若仍不足则记录问题
            new_dx = x2 - x1
            new_dy = y2 - y1
            new_distance = math.sqrt(new_dx * new_dx + new_dy * new_dy)
            if new_distance + 1e-3 < min_distance:
                issues.append(
                    f"障碍物{i + 1}与{i + 2}间距{new_distance:.1f}米小于最小要求{min_distance}米"
                )

        return obstacles, issues

    def _check_route_direction(
        self,
        obstacles: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """检查路线方向合理性"""
        warnings = []

        if len(obstacles) < 2:
            return obstacles, warnings

        left_turns = 0
        right_turns = 0

        for i in range(len(obstacles) - 2):
            pos1 = obstacles[i].get('position', {})
            pos2 = obstacles[i + 1].get('position', {})
            pos3 = obstacles[i + 2].get('position', {})

            x1, y1 = pos1.get('x', 0), pos1.get('y', 0)
            x2, y2 = pos2.get('x', 0), pos2.get('y', 0)
            x3, y3 = pos3.get('x', 0), pos3.get('y', 0)

            cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2)

            if cross > 0:
                left_turns += 1
            elif cross < 0:
                right_turns += 1

        if right_turns > left_turns * 1.5:
            warnings.append(
                f"路线以右转弯为主({right_turns}次右转，{left_turns}次左转)，"
                f"建议增加左转弯以符合马匹逆时针跑步习惯"
            )

        return obstacles, warnings

    def calculate_route_metrics(
        self,
        obstacles: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """计算路线指标"""
        if not obstacles:
            return {
                'total_distance': 0,
                'avg_obstacle_distance': 0,
                'turn_count': 0,
                'difficulty_score': 0
            }

        total_distance = 0
        distances = []

        for i in range(len(obstacles) - 1):
            pos1 = obstacles[i].get('position', {})
            pos2 = obstacles[i + 1].get('position', {})

            x1, y1 = pos1.get('x', 0), pos1.get('y', 0)
            x2, y2 = pos2.get('x', 0), pos2.get('y', 0)

            distance = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            distances.append(distance)
            total_distance += distance

        avg_distance = sum(distances) / len(distances) if distances else 0

        turn_count = 0
        for i in range(len(obstacles) - 2):
            pos1 = obstacles[i].get('position', {})
            pos2 = obstacles[i + 1].get('position', {})
            pos3 = obstacles[i + 2].get('position', {})

            x1, y1 = pos1.get('x', 0), pos1.get('y', 0)
            x2, y2 = pos2.get('x', 0), pos2.get('y', 0)
            x3, y3 = pos3.get('x', 0), pos3.get('y', 0)

            v1 = (x2 - x1, y2 - y1)
            v2 = (x3 - x2, y3 - y2)

            dot = v1[0] * v2[0] + v1[1] * v2[1]
            mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
            mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)

            if mag1 > 0 and mag2 > 0:
                cos_angle = dot / (mag1 * mag2)
                cos_angle = max(-1, min(1, cos_angle))
                angle = math.acos(cos_angle)

                if angle > math.pi / 6:
                    turn_count += 1

        type_weights = {
            'SINGLE': 1, 'DOUBLE': 1.5, 'COMBINATION': 2,
            'WALL': 2, 'LIVERPOOL': 2.5, 'WATER': 2.5
        }

        difficulty_score = sum(
            type_weights.get(obs.get('type', 'SINGLE'), 1)
            for obs in obstacles
        )
        difficulty_score = min(difficulty_score / (len(obstacles) * 2) * 10, 10)

        return {
            'total_distance': round(total_distance, 1),
            'avg_obstacle_distance': round(avg_distance, 1),
            'turn_count': turn_count,
            'difficulty_score': round(difficulty_score, 1)
        }
