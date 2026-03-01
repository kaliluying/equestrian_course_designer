from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
import random
import math
import uuid


@dataclass
class ObstacleConfig:
    """障碍物配置 - 与前端 Obstacle 类型匹配"""
    id: str
    type: str  # SINGLE, DOUBLE, COMBINATION, WALL, LIVERPOOL, WATER
    position: Dict[str, float]  # {x, y}
    rotation: float
    number: str
    poles: List[Dict[str, Any]]
    wallProperties: Optional[Dict[str, Any]] = None
    liverpoolProperties: Optional[Dict[str, Any]] = None
    waterProperties: Optional[Dict[str, Any]] = None


@dataclass
class PathPoint:
    """路径点"""
    x: float
    y: float
    controlPoint1: Optional[Dict[str, float]] = None
    controlPoint2: Optional[Dict[str, float]] = None


@dataclass
class RouteConfig:
    """路线配置"""
    field_width: float = 90  # 米
    field_height: float = 60  # 米
    obstacle_count: int = 12
    difficulty: str = "medium"  # easy, medium, hard
    include_combinations: bool = True
    start_position: Optional[tuple] = None  # 起点 x, y
    end_position: Optional[tuple] = None  # 终点 x, y

    def __post_init__(self):
        if self.start_position is None:
            self.start_position = (10, 10)
        if self.end_position is None:
            self.end_position = (80, 50)


class RouteGenerator:
    """路线生成规则引擎"""

    # FEI 障碍物间距要求（米）
    MIN_OBSTACLE_DISTANCE = 6.0
    FIELD_MARGIN = 5.0  # 场地边距

    # 障碍物类型权重（根据难度）
    OBSTACLE_TYPE_WEIGHTS = {
        'easy': {'SINGLE': 0.7, 'DOUBLE': 0.3},
        'medium': {'SINGLE': 0.5, 'DOUBLE': 0.3, 'COMBINATION': 0.1, 'LIVERPOOL': 0.1},
        'hard': {'SINGLE': 0.3, 'DOUBLE': 0.25, 'COMBINATION': 0.2, 'WALL': 0.1, 'LIVERPOOL': 0.15}
    }

    def generate(self, config: RouteConfig) -> Dict[str, Any]:
        """生成完整路线设计"""
        obstacles = self._generate_obstacles(config)
        path = self._generate_path(obstacles, config)

        return {
            'obstacles': [asdict(o) for o in obstacles],
            'path': path,
            'difficulty_score': self._calculate_difficulty(obstacles),
            'estimated_time': self._estimate_time(obstacles, path),
            'explanation': self._generate_explanation(obstacles),
            'teaching_notes': self._generate_teaching_notes(obstacles, config.difficulty)
        }

    def _generate_obstacles(self, config: RouteConfig) -> List[ObstacleConfig]:
        """生成障碍物列表 - 按路径顺序生成"""
        obstacles = []
        used_positions = []

        weights = self.OBSTACLE_TYPE_WEIGHTS.get(config.difficulty, self.OBSTACLE_TYPE_WEIGHTS['medium'])
        types = list(weights.keys())
        probs = list(weights.values())

        # 获取起点和终点
        start_x, start_y = config.start_position or (10, 10)
        end_x, end_y = config.end_position or (config.field_width - 10, config.field_height - 10)

        # 生成一条从起点到终点的蜿蜒路径
        # 使用正弦波或多项式曲线来创建自然的路线
        waypoints = self._generate_waypoints(start_x, start_y, end_x, end_y, config.obstacle_count, config)

        for i, waypoint in enumerate(waypoints):
            # 选择障碍物类型
            obs_type = random.choices(types, weights=probs, k=1)[0]

            # 计算朝向下一个障碍物的角度
            if i < len(waypoints) - 1:
                next_wp = waypoints[i + 1]
                dx = next_wp[0] - waypoint[0]
                dy = next_wp[1] - waypoint[1]
            else:
                # 最后一个障碍物朝向终点
                dx = end_x - waypoint[0]
                dy = end_y - waypoint[1]

            # 将角度转换为旋转值 (0, 90, 180, 270)
            rotation = self._calculate_rotation(dx, dy)

            obstacle = self._create_obstacle(
                obstacle_id=str(uuid.uuid4()),
                obs_type=obs_type,
                x=waypoint[0],
                y=waypoint[1],
                number=str(i + 1),
                rotation=rotation
            )
            obstacles.append(obstacle)
            used_positions.append(waypoint)

        return obstacles

    def _generate_waypoints(self, start_x: float, start_y: float, end_x: float, end_y: float, count: int, config: RouteConfig) -> List[tuple]:
        """生成从起点到终点的路径点"""
        waypoints = []

        # 计算起点到终点的总距离和方向
        dx_total = end_x - start_x
        dy_total = end_y - start_y
        distance = math.sqrt(dx_total ** 2 + dy_total ** 2)

        # 添加随机偏移，使路线不那么直
        max_offset = min(15, distance * 0.2)

        for i in range(count):
            # 线性插值位置
            t = (i + 1) / (count + 1)
            base_x = start_x + dx_total * t
            base_y = start_y + dy_total * t

            # 添加正弦波偏移，创造蜿蜒效果
            offset_x = math.sin(t * math.pi * 2) * max_offset * random.uniform(0.3, 1.0)
            offset_y = math.cos(t * math.pi * 1.5) * max_offset * random.uniform(0.3, 1.0)

            # 确保在场地范围内
            x = max(self.FIELD_MARGIN, min(config.field_width - self.FIELD_MARGIN, base_x + offset_x))
            y = max(self.FIELD_MARGIN, min(config.field_height - self.FIELD_MARGIN, base_y + offset_y))

            waypoints.append((x, y))

        return waypoints

    def _calculate_rotation(self, dx: float, dy: float) -> int:
        """根据方向向量计算障碍物旋转角度

        映射关系（障碍物横杆方向，马垂直于横杆跳跃）：
        - rotation = 0: 横杆水平，马向上跳
        - rotation = 90: 横杆垂直，马向右跳
        - rotation = 180: 横杆水平，马向下跳
        - rotation = 270: 横杆垂直，马向左跳
        """
        # 计算角度（弧度）
        angle = math.atan2(dy, dx)

        # 转换为度数
        degrees = math.degrees(angle)
        # 将角度转换到 0-360 范围
        degrees = (degrees + 360) % 360

        # 映射到最近的 90 度
        # 角度定义：0=右, 90=下, 180=左, 270=上（在屏幕坐标系中y向下）
        if -45 <= degrees < 45 or degrees >= 315:
            return 90   # 向右 -> 横杆垂直，马向右跳
        elif 45 <= degrees < 135:
            return 180  # 向下 -> 横杆水平，马向下跳
        elif 135 <= degrees < 225:
            return 270  # 向左 -> 横杆垂直，马向左跳
        else:
            return 0    # 向上 -> 横杆水平，向上跳

    def _find_valid_position(self, config: RouteConfig, used_positions: List[tuple]) -> Optional[tuple]:
        """找到有效的障碍物位置"""
        max_attempts = 100

        for _ in range(max_attempts):
            x = random.uniform(self.FIELD_MARGIN, config.field_width - self.FIELD_MARGIN)
            y = random.uniform(self.FIELD_MARGIN, config.field_height - self.FIELD_MARGIN)

            # 检查与其他障碍物的距离
            valid = True
            for pos in used_positions:
                dist = math.sqrt((x - pos[0])**2 + (y - pos[1])**2)
                if dist < self.MIN_OBSTACLE_DISTANCE:
                    valid = False
                    break

            if valid:
                return (x, y)

        return None

    def _create_obstacle(self, obstacle_id: str, obs_type: str, x: float, y: float, number: str, rotation: int = None) -> ObstacleConfig:
        """创建障碍物配置"""
        if rotation is None:
            rotation = random.choice([0, 90, 180, 270])

        # 基础横杆配置
        poles = [{'height': 1.4, 'width': 3.5, 'color': '#8B4513'}]
        wall_props = None
        liverpool_props = None
        water_props = None

        if obs_type == 'DOUBLE':
            poles = [
                {'height': 1.3, 'width': 3.5, 'color': '#8B4513', 'spacing': 0.7},
                {'height': 1.4, 'width': 3.5, 'color': '#654321'}
            ]
        elif obs_type == 'COMBINATION':
            poles = [
                {'height': 1.2, 'width': 3.5, 'color': '#8B4513', 'spacing': 0.6},
                {'height': 1.3, 'width': 3.5, 'color': '#654321', 'spacing': 0.6},
                {'height': 1.4, 'width': 3.5, 'color': '#8B4513'}
            ]
        elif obs_type == 'LIVERPOOL':
            poles = [
                {'height': 1.3, 'width': 3.5, 'color': '#8B4513'}
            ]
            liverpool_props = {
                'width': 3.5,
                'height': 1.6,
                'waterDepth': 0.2,
                'waterColor': '#1E90FF',
                'hasRail': True
            }
        elif obs_type == 'WALL':
            wall_props = {
                'width': 3.5,
                'height': 1.6,
                'color': '#808080'
            }
        elif obs_type == 'WATER':
            water_props = {
                'width': 4.0,
                'depth': 2.0,
                'color': '#1E90FF',
                'borderColor': '#4169E1',
                'borderWidth': 0.1
            }

        return ObstacleConfig(
            id=obstacle_id,
            type=obs_type,
            position={'x': round(x, 2), 'y': round(y, 2)},
            rotation=rotation,
            number=number,
            poles=poles,
            wallProperties=wall_props,
            liverpoolProperties=liverpool_props,
            waterProperties=water_props
        )

    def _generate_path(self, obstacles: List[ObstacleConfig], config: RouteConfig) -> Dict[str, Any]:
        """生成骑乘路径

        返回与前端兼容的路径点格式：
        - 1个起点
        - 每个障碍物5个点（连接点1, 接近直线起点, 障碍物中心点, 离开直线终点, 连接点2）
        """
        if not obstacles:
            return {'visible': False, 'points': []}

        # 按编号排序
        sorted_obstacles = sorted(obstacles, key=lambda o: int(o.number))

        points = []

        # 第一个障碍物的参数
        first_obs = sorted_obstacles[0]
        approach_distance = 1
        depart_distance = 1
        total_length = 1.4  # 默认单横杆宽度

        # 计算第一个障碍物的角度
        angle_first = self._get_obstacle_angle(first_obs.rotation)

        # 起点
        start_x = first_obs.position['x'] - math.cos(angle_first) * (approach_distance + total_length / 2 + 2)
        start_y = first_obs.position['y'] - math.sin(angle_first) * (approach_distance + total_length / 2 + 2)
        points.append({'x': start_x, 'y': start_y})

        # 为每个障碍物生成5个路径点
        for obs in sorted_obstacles:
            center_x = obs.position['x']
            center_y = obs.position['y']
            angle = self._get_obstacle_angle(obs.rotation)

            # 计算障碍物总长度
            if obs.type == 'DOUBLE' and len(obs.poles) > 1:
                total_length = obs.poles[0]['height'] + (obs.poles[0].get('spacing', 0) or 0) + obs.poles[1]['height']
            elif obs.type == 'COMBINATION':
                total_length = sum(p['height'] + (p.get('spacing', 0) or 0) for p in obs.poles)
            elif obs.type == 'WALL' and obs.wallProperties:
                total_length = obs.wallProperties.get('height', 1.4)
            elif obs.type == 'LIVERPOOL' and obs.liverpoolProperties:
                total_length = obs.liverpoolProperties.get('height', 1.6)
            else:
                total_length = obs.poles[0]['height'] if obs.poles else 1.4

            # 1. 障碍物前的连接点（在马前进方向的相反侧）
            points.append({
                'x': center_x + math.cos(angle) * (approach_distance + total_length / 2),
                'y': center_y + math.sin(angle) * (approach_distance + total_length / 2)
            })

            # 2. 接近直线的起点
            points.append({
                'x': center_x + math.cos(angle) * (approach_distance + total_length / 2),
                'y': center_y + math.sin(angle) * (approach_distance + total_length / 2)
            })

            # 3. 障碍物中心点
            points.append({'x': center_x, 'y': center_y})

            # 4. 离开直线的终点（在马前进方向的一侧）
            points.append({
                'x': center_x - math.cos(angle) * (depart_distance + total_length / 2),
                'y': center_y - math.sin(angle) * (depart_distance + total_length / 2)
            })

            # 5. 障碍物后的连接点
            points.append({
                'x': center_x - math.cos(angle) * (depart_distance + total_length / 2),
                'y': center_y - math.sin(angle) * (depart_distance + total_length / 2)
            })

        return {
            'visible': True,
            'points': points,
            'startPoint': {'x': start_x, 'y': start_y, 'rotation': first_obs.rotation or 0},
            'endPoint': {
                'x': points[-1]['x'],
                'y': points[-1]['y'],
                'rotation': (sorted_obstacles[-1].rotation + 180) % 360
            }
        }

    def _get_obstacle_angle(self, rotation) -> float:
        """将障碍物旋转角度转换为弧度（减去270度以调整方向）"""
        if rotation is None:
            rotation = 0
        return (rotation - 270) * (math.pi / 180)

    def _calculate_difficulty(self, obstacles: List[ObstacleConfig]) -> float:
        """计算难度评分 (0-10)"""
        type_weights = {
            'SINGLE': 1, 'DOUBLE': 1.5, 'COMBINATION': 2,
            'WALL': 2, 'LIVERPOOL': 2.5, 'WATER': 2.5
        }

        score = sum(type_weights.get(o.type, 1) for o in obstacles)
        normalized = min(score / (len(obstacles) * 2) * 10, 10)
        return round(normalized, 1)

    def _estimate_time(self, obstacles: List[ObstacleConfig], path: Dict) -> int:
        """估算完成时间（秒）"""
        if not path.get('points'):
            return 0

        points = path['points']
        total_length = sum(
            math.sqrt((points[i]['x'] - points[i-1]['x'])**2 +
                     (points[i]['y'] - points[i-1]['y'])**2)
            for i in range(1, len(points))
        )

        # 平均速度 350 米/分钟
        return int((total_length / 350) * 60)

    def _generate_explanation(self, obstacles: List[ObstacleConfig]) -> str:
        """生成设计说明"""
        type_counts = {}
        for obs in obstacles:
            type_counts[obs.type] = type_counts.get(obs.type, 0) + 1

        explanation = f"本路线共包含 {len(obstacles)} 道障碍物。"

        type_names = {
            'SINGLE': '单横杆', 'DOUBLE': '双横杆', 'COMBINATION': '组合障碍',
            'WALL': '砖墙', 'LIVERPOOL': '利物浦', 'WATER': '水障'
        }

        for obs_type, count in type_counts.items():
            if count > 0:
                explanation += f"其中{type_names.get(obs_type, obs_type)} {count} 道，"

        return explanation.rstrip('，') + '。'

    def _generate_teaching_notes(self, obstacles: List[ObstacleConfig], difficulty: str) -> str:
        """生成教学建议"""
        notes = []

        if difficulty == 'easy':
            notes.append("适合初学者训练基础节奏感")
        elif difficulty == 'medium':
            notes.append("适合中级骑手提升技术水平")
        else:
            notes.append("适合高级骑手挑战极限")

        types = [o.type for o in obstacles]
        if 'LIVERPOOL' in types:
            notes.append("注意利物浦障碍的水池训练")
        if 'COMBINATION' in types:
            notes.append("组合障碍需要精准的节奏控制")

        return ' | '.join(notes)
