"""
路线验证和优化模块
根据FEI规则验证和优化AI生成的障碍赛路线
"""
import math
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
import logging

from .route_generator import ObstacleConfig, RouteConfig, RouteGenerator

logger = logging.getLogger(__name__)


class RouteValidationInputError(ValueError):
    """路线输入包含无法安全解析的数值或结构。"""


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
        self._validate_numeric_inputs(obstacles)
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


    def _structured_issue(
        self,
        code: str,
        severity: str,
        message: str,
        obstacle_ids: List[str],
        suggested_action: str,
        auto_fixable: bool = False,
    ) -> Dict[str, Any]:
        """构造前端规则检查面板使用的结构化问题。"""
        return {
            'code': code,
            'severity': severity,
            'message': message,
            'obstacle_ids': obstacle_ids,
            'suggested_action': suggested_action,
            'auto_fixable': auto_fixable,
        }

    def _obstacle_id(self, obstacle: Dict[str, Any], index: int) -> str:
        """获取稳定的障碍物标识。"""
        return str(obstacle.get('id') or obstacle.get('number') or index + 1)

    def _obstacle_number(self, obstacle: Dict[str, Any], index: int) -> str:
        """获取用户可见的障碍编号。"""
        return str(obstacle.get('number') or index + 1)

    def validate_course_structure(
        self,
        obstacles: List[Dict[str, Any]],
        difficulty: str = 'medium',
        path: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """返回供前端规则检查面板使用的结构化校验结果。"""
        self._validate_numeric_inputs(obstacles, path)
        issues: List[Dict[str, Any]] = []
        warnings: List[Dict[str, Any]] = []
        auto_fixed: List[str] = []

        if not obstacles:
            issues.append(self._structured_issue(
                'EMPTY_ROUTE',
                'error',
                '路线中没有障碍物，请至少添加一道障碍。',
                [],
                '添加障碍物后重新检查。',
                False,
            ))
            return {
                'score': 0,
                'is_valid': False,
                'issues': issues,
                'warnings': warnings,
                'auto_fixed': auto_fixed,
                'summary': '路线中没有障碍物。',
            }

        config = DIFFICULTY_CONFIGS.get(difficulty, DIFFICULTY_CONFIGS['medium'])
        min_distance = FEI_RULES['min_obstacle_distance']
        boundary_margin = FEI_RULES['min_boundary_distance']

        for index, obstacle in enumerate(obstacles):
            obstacle_id = self._obstacle_id(obstacle, index)
            number = self._obstacle_number(obstacle, index)
            position = obstacle.get('position') or {}
            x = float(position.get('x', 0))
            y = float(position.get('y', 0))

            if (
                x < boundary_margin
                or y < boundary_margin
                or x > self.field_width - boundary_margin
                or y > self.field_height - boundary_margin
            ):
                warnings.append(self._structured_issue(
                    'BOUNDARY_DISTANCE',
                    'warning',
                    f'障碍物{number}距离场地边界不足{boundary_margin}米。',
                    [obstacle_id],
                    '将障碍物向场地内部移动，保留安全边距。',
                    True,
                ))

            for pole_index, pole in enumerate(obstacle.get('poles') or []):
                height = float(pole.get('height', 0))
                if height < config.min_height or height > config.max_height:
                    warnings.append(self._structured_issue(
                        'HEIGHT_RANGE',
                        'warning',
                        f'障碍物{number}第{pole_index + 1}根横杆高度{height:.2f}m超出{difficulty}难度范围。',
                        [obstacle_id],
                        f'将高度调整到{config.min_height:.2f}m-{config.max_height:.2f}m之间。',
                        True,
                    ))

            obs_type = obstacle.get('type')
            if obs_type in FEI_RULES['combination_spacing']:
                min_spacing, max_spacing = FEI_RULES['combination_spacing'][obs_type]
                for pole_index, pole in enumerate((obstacle.get('poles') or [])[:-1]):
                    spacing = pole.get('spacing')
                    if spacing is None:
                        continue
                    spacing_value = float(spacing)
                    if spacing_value < min_spacing or spacing_value > max_spacing:
                        warnings.append(self._structured_issue(
                            'COMBINATION_SPACING',
                            'warning',
                            f'障碍物{number}组合间距{spacing_value:.1f}m不在{min_spacing:.1f}-{max_spacing:.1f}m范围内。',
                            [obstacle_id],
                            '调整组合障碍内横杆间距，保持节奏稳定。',
                            True,
                        ))

        parsed_numbers: List[int] = []
        for obstacle in obstacles:
            try:
                parsed_numbers.append(int(str(obstacle.get('number', '')).strip()))
            except ValueError:
                parsed_numbers.append(-1)
        expected_numbers = list(range(1, len(obstacles) + 1))
        if parsed_numbers != expected_numbers:
            warnings.append(self._structured_issue(
                'OBSTACLE_SEQUENCE',
                'warning',
                '障碍编号顺序与当前路线顺序不一致。',
                [self._obstacle_id(obstacle, index) for index, obstacle in enumerate(obstacles)],
                '按骑乘顺序重新编号障碍物。',
                True,
            ))

        turn_angles: List[float] = []
        total_distance = 0.0
        for index in range(len(obstacles) - 1):
            current = obstacles[index]
            nxt = obstacles[index + 1]
            current_pos = current.get('position') or {}
            next_pos = nxt.get('position') or {}
            dx = float(next_pos.get('x', 0)) - float(current_pos.get('x', 0))
            dy = float(next_pos.get('y', 0)) - float(current_pos.get('y', 0))
            distance = math.sqrt(dx * dx + dy * dy)
            total_distance += distance
            if distance < min_distance:
                issues.append(self._structured_issue(
                    'MIN_DISTANCE',
                    'error',
                    f'障碍物{self._obstacle_number(current, index)}与{self._obstacle_number(nxt, index + 1)}间距{distance:.1f}米，小于最小要求{min_distance}米。',
                    [self._obstacle_id(current, index), self._obstacle_id(nxt, index + 1)],
                    '拉开相邻障碍物距离，保持安全骑乘节奏。',
                    True,
                ))

        for index in range(1, len(obstacles) - 1):
            prev_pos = obstacles[index - 1].get('position') or {}
            current_pos = obstacles[index].get('position') or {}
            next_pos = obstacles[index + 1].get('position') or {}
            v1 = (
                float(current_pos.get('x', 0)) - float(prev_pos.get('x', 0)),
                float(current_pos.get('y', 0)) - float(prev_pos.get('y', 0)),
            )
            v2 = (
                float(next_pos.get('x', 0)) - float(current_pos.get('x', 0)),
                float(next_pos.get('y', 0)) - float(current_pos.get('y', 0)),
            )
            len1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
            len2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
            if len1 < 1e-6 or len2 < 1e-6:
                continue
            dot = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2)))
            angle = math.degrees(math.acos(dot))
            turn_angles.append(angle)
            if angle > 85:
                warnings.append(self._structured_issue(
                    'TURN_RADIUS',
                    'warning',
                    f'障碍物{self._obstacle_number(obstacles[index], index)}附近转弯角度约{angle:.0f}°，转弯半径可能不足。',
                    [self._obstacle_id(obstacles[index], index)],
                    '增加转弯空间或调整前后障碍位置。',
                    False,
                ))

        if len(turn_angles) >= 2 and sum(1 for angle in turn_angles if angle > 70) >= 2:
            warnings.append(self._structured_issue(
                'ROUTE_FLOW',
                'warning',
                '路线中连续急转弯较多，整体流畅度偏低。',
                [self._obstacle_id(obstacle, index) for index, obstacle in enumerate(obstacles)],
                '减少连续急转弯，增加直线推进段。',
                False,
            ))

        if path:
            start_point = path.get('startPoint') or path.get('start_point') or {}
            end_point = path.get('endPoint') or path.get('end_point') or {}
            start_rotation = float(start_point.get('rotation', 270))
            end_rotation = float(end_point.get('rotation', 270))
            first_pos = obstacles[0].get('position') or {}
            last_pos = obstacles[-1].get('position') or {}
            if start_point:
                approach_angle = math.degrees(math.atan2(
                    float(first_pos.get('y', 0)) - float(start_point.get('y', 0)),
                    float(first_pos.get('x', 0)) - float(start_point.get('x', 0)),
                )) % 360
                if abs(((approach_angle - start_rotation + 180) % 360) - 180) > 90:
                    warnings.append(self._structured_issue(
                        'START_END_DIRECTION',
                        'warning',
                        '起点方向与第一道障碍的骑乘方向不一致。',
                        [self._obstacle_id(obstacles[0], 0)],
                        '调整起点箭头方向或起点位置。',
                        False,
                    ))
            if end_point:
                exit_angle = math.degrees(math.atan2(
                    float(end_point.get('y', 0)) - float(last_pos.get('y', 0)),
                    float(end_point.get('x', 0)) - float(last_pos.get('x', 0)),
                )) % 360
                if abs(((exit_angle - end_rotation + 180) % 360) - 180) > 90:
                    warnings.append(self._structured_issue(
                        'START_END_DIRECTION',
                        'warning',
                        '终点方向与最后一道障碍后的骑乘方向不一致。',
                        [self._obstacle_id(obstacles[-1], len(obstacles) - 1)],
                        '调整终点箭头方向或终点位置。',
                        False,
                    ))

        penalty = len(issues) * 2.5 + len(warnings) * 0.75
        if total_distance > 0 and len(obstacles) > 1 and total_distance / (len(obstacles) - 1) < min_distance * 1.2:
            penalty += 0.5
        score = max(0, round(10 - penalty, 1))
        is_valid = len(issues) == 0
        summary = f'发现{len(issues)}个严重问题、{len(warnings)}个提醒。' if issues or warnings else '未发现需要处理的问题。'

        return {
            'score': score,
            'is_valid': is_valid,
            'issues': issues,
            'warnings': warnings,
            'auto_fixed': auto_fixed,
            'summary': summary,
        }

    def fix_course_structure(
        self,
        obstacles: List[Dict[str, Any]],
        difficulty: str = 'medium',
        path: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """对常见可自动修复问题生成修复后的路线。"""
        import copy

        self._validate_numeric_inputs(obstacles, path)
        config = DIFFICULTY_CONFIGS.get(difficulty, DIFFICULTY_CONFIGS['medium'])
        margin = FEI_RULES['min_boundary_distance']
        min_distance = FEI_RULES['min_obstacle_distance']
        updated = copy.deepcopy(obstacles)
        patches: List[Dict[str, Any]] = []

        for index, obstacle in enumerate(updated):
            obstacle_id = self._obstacle_id(obstacle, index)
            position = obstacle.setdefault('position', {})
            old_x = float(position.get('x', 0))
            old_y = float(position.get('y', 0))
            new_x = max(margin, min(self.field_width - margin, old_x))
            new_y = max(margin, min(self.field_height - margin, old_y))
            if abs(new_x - old_x) > 1e-6 or abs(new_y - old_y) > 1e-6:
                position['x'] = round(new_x, 2)
                position['y'] = round(new_y, 2)
                patches.append({
                    'code': 'BOUNDARY_DISTANCE',
                    'obstacle_ids': [obstacle_id],
                    'message': f'已将障碍物{self._obstacle_number(obstacle, index)}移回安全边界内。',
                })

            for pole_index, pole in enumerate(obstacle.get('poles') or []):
                old_height = float(pole.get('height', config.min_height))
                new_height = max(config.min_height, min(config.max_height, old_height))
                if abs(new_height - old_height) > 1e-6:
                    pole['height'] = round(new_height, 2)
                    patches.append({
                        'code': 'HEIGHT_RANGE',
                        'obstacle_ids': [obstacle_id],
                        'message': f'已将障碍物{self._obstacle_number(obstacle, index)}第{pole_index + 1}根横杆高度调整至{new_height:.2f}m。',
                    })

            obs_type = obstacle.get('type')
            if obs_type in FEI_RULES['combination_spacing']:
                min_spacing, max_spacing = FEI_RULES['combination_spacing'][obs_type]
                target_spacing = round((min_spacing + max_spacing) / 2, 2)
                for pole in (obstacle.get('poles') or [])[:-1]:
                    spacing = pole.get('spacing')
                    if spacing is None:
                        continue
                    spacing_value = float(spacing)
                    if spacing_value < min_spacing or spacing_value > max_spacing:
                        pole['spacing'] = target_spacing
                        patches.append({
                            'code': 'COMBINATION_SPACING',
                            'obstacle_ids': [obstacle_id],
                            'message': f'已将障碍物{self._obstacle_number(obstacle, index)}组合间距调整为{target_spacing:.2f}m。',
                        })

        for index in range(len(updated) - 1):
            current = updated[index]
            nxt = updated[index + 1]
            current_pos = current.setdefault('position', {})
            next_pos = nxt.setdefault('position', {})
            x1, y1 = float(current_pos.get('x', 0)), float(current_pos.get('y', 0))
            x2, y2 = float(next_pos.get('x', 0)), float(next_pos.get('y', 0))
            dx = x2 - x1
            dy = y2 - y1
            distance = math.sqrt(dx * dx + dy * dy)
            if distance < min_distance:
                if distance < 1e-6:
                    ux, uy = 1.0, 0.0
                else:
                    ux, uy = dx / distance, dy / distance
                x2 = x1 + ux * min_distance
                y2 = y1 + uy * min_distance
                x2 = max(margin, min(self.field_width - margin, x2))
                y2 = max(margin, min(self.field_height - margin, y2))
                next_pos['x'] = round(x2, 2)
                next_pos['y'] = round(y2, 2)
                patches.append({
                    'code': 'MIN_DISTANCE',
                    'obstacle_ids': [self._obstacle_id(current, index), self._obstacle_id(nxt, index + 1)],
                    'message': f'已拉开障碍物{self._obstacle_number(current, index)}与{self._obstacle_number(nxt, index + 1)}的距离。',
                })

        updated_path = self._generate_path_from_obstacles(updated)
        if isinstance(path, dict) and path.get('visible') is False:
            updated_path['visible'] = False

        validation = self.validate_course_structure(
            updated,
            difficulty=difficulty,
            path=updated_path,
        )
        validation['auto_fixed'] = [patch['message'] for patch in patches]
        return {
            'patches': patches,
            'updated_obstacles': updated,
            'updated_path': updated_path,
            'validation': validation,
            'explanation': f'已应用{len(patches)}项自动修复。',
        }

    def _generate_path_from_obstacles(self, obstacles: List[Dict[str, Any]]) -> Dict[str, Any]:
        """根据修复后的障碍物重新生成路径，避免返回过期坐标。"""
        route_obstacles = []
        for index, obstacle in enumerate(obstacles):
            position = obstacle.get('position') or {}
            try:
                rotation = int(float(obstacle.get('rotation', 0))) % 360
            except (TypeError, ValueError):
                rotation = 0
            route_obstacles.append(ObstacleConfig(
                id=str(obstacle.get('id') or f'obs-{index + 1}'),
                type=str(obstacle.get('type') or 'SINGLE'),
                position={
                    'x': float(position.get('x', 0)),
                    'y': float(position.get('y', 0)),
                },
                rotation=rotation,
                number=str(obstacle.get('number') or index + 1),
                poles=obstacle.get('poles') or [
                    {'height': 1.4, 'width': 3.5, 'color': '#8B4513'}
                ],
                wallProperties=obstacle.get('wallProperties'),
                liverpoolProperties=obstacle.get('liverpoolProperties'),
                waterProperties=obstacle.get('waterProperties'),
            ))
        return RouteGenerator()._generate_path(
            route_obstacles,
            RouteConfig(
                field_width=self.field_width,
                field_height=self.field_height,
                obstacle_count=len(route_obstacles),
            ),
        )

    def _validate_numeric_inputs(self, obstacles, path=None) -> None:
        """预先校验所有会进入 float/math 运算的用户输入。"""
        if not isinstance(obstacles, list) or len(obstacles) > 200:
            raise RouteValidationInputError('障碍物数据必须是数组且数量不超过 200')

        def finite_number(value, field):
            try:
                number = float(value)
            except (TypeError, ValueError) as exc:
                raise RouteValidationInputError(f'{field} 必须是数字') from exc
            if not math.isfinite(number) or abs(number) > 100000:
                raise RouteValidationInputError(f'{field} 数值超出允许范围')
            return number

        for index, obstacle in enumerate(obstacles):
            if not isinstance(obstacle, dict):
                raise RouteValidationInputError(f'第 {index + 1} 个障碍物格式无效')
            number = obstacle.get('number')
            if number is not None and str(number).strip():
                try:
                    parsed_number = float(number)
                except (TypeError, ValueError) as exc:
                    raise RouteValidationInputError(
                        f'障碍物 {index + 1} 的编号必须是整数'
                    ) from exc
                if (
                    not math.isfinite(parsed_number)
                    or parsed_number < 1
                    or parsed_number != int(parsed_number)
                ):
                    raise RouteValidationInputError(f'障碍物 {index + 1} 的编号必须是正整数')
            position = obstacle.get('position') or {}
            if not isinstance(position, dict):
                raise RouteValidationInputError(f'第 {index + 1} 个障碍物位置格式无效')
            finite_number(position.get('x', 0), f'障碍物 {index + 1} 的 x')
            finite_number(position.get('y', 0), f'障碍物 {index + 1} 的 y')
            poles = obstacle.get('poles') or []
            if not isinstance(poles, list) or len(poles) > 50:
                raise RouteValidationInputError(f'障碍物 {index + 1} 的横杆数据无效')
            for pole_index, pole in enumerate(poles):
                if not isinstance(pole, dict):
                    raise RouteValidationInputError(f'障碍物 {index + 1} 的横杆格式无效')
                if 'height' not in pole:
                    raise RouteValidationInputError(
                        f'障碍物 {index + 1} 横杆 {pole_index + 1} 缺少高度'
                    )
                finite_number(pole['height'], f'障碍物 {index + 1} 横杆 {pole_index + 1} 高度')
                if pole.get('width') is not None:
                    finite_number(pole['width'], f'障碍物 {index + 1} 横杆 {pole_index + 1} 宽度')
                if pole.get('spacing') is not None:
                    finite_number(pole['spacing'], f'障碍物 {index + 1} 横杆 {pole_index + 1} 间距')

            property_fields = {
                'wallProperties': ('height', 'width'),
                'liverpoolProperties': ('height', 'width', 'waterDepth', 'railHeight'),
                'waterProperties': ('width', 'depth', 'borderWidth'),
            }
            for property_name, fields in property_fields.items():
                properties = obstacle.get(property_name)
                if properties is None:
                    continue
                if not isinstance(properties, dict):
                    raise RouteValidationInputError(
                        f'障碍物 {index + 1} 的 {property_name} 格式无效'
                    )
                for field in fields:
                    if field in properties:
                        finite_number(
                            properties[field],
                            f'障碍物 {index + 1} 的 {property_name}.{field}',
                        )

        if path is not None:
            if not isinstance(path, dict):
                raise RouteValidationInputError('路径数据格式无效')
            for point_name in ('startPoint', 'start_point', 'endPoint', 'end_point'):
                point = path.get(point_name)
                if point is None:
                    continue
                if not isinstance(point, dict):
                    raise RouteValidationInputError(f'{point_name} 格式无效')
                finite_number(point.get('x', 0), f'{point_name}.x')
                finite_number(point.get('y', 0), f'{point_name}.y')
                finite_number(point.get('rotation', 270), f'{point_name}.rotation')

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
