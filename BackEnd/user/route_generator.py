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
        """生成障碍物列表"""
        obstacles = []
        used_positions = []

        weights = self.OBSTACLE_TYPE_WEIGHTS.get(config.difficulty, self.OBSTACLE_TYPE_WEIGHTS['medium'])
        types = list(weights.keys())
        probs = list(weights.values())

        for i in range(config.obstacle_count):
            # 选择障碍物类型
            obs_type = random.choices(types, weights=probs, k=1)[0]

            # 生成有效位置
            position = self._find_valid_position(config, used_positions)
            if position:
                used_positions.append(position)

                obstacle = self._create_obstacle(
                    obstacle_id=str(uuid.uuid4()),
                    obs_type=obs_type,
                    x=position[0],
                    y=position[1],
                    number=str(i + 1)
                )
                obstacles.append(obstacle)

        return obstacles

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

    def _create_obstacle(self, obstacle_id: str, obs_type: str, x: float, y: float, number: str) -> ObstacleConfig:
        """创建障碍物配置"""
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
        """生成骑乘路径"""
        if not obstacles:
            return {'visible': False, 'points': []}

        # 按编号排序
        sorted_obstacles = sorted(obstacles, key=lambda o: int(o.number))

        points = []

        # 起点
        first_obs = sorted_obstacles[0]
        points.append({'x': first_obs.position['x'] - 3, 'y': first_obs.position['y']})

        # 经过每个障碍物
        for obs in sorted_obstacles:
            points.append({'x': obs.position['x'], 'y': obs.position['y']})

        # 终点
        last_obs = sorted_obstacles[-1]
        points.append({'x': last_obs.position['x'] + 3, 'y': last_obs.position['y']})

        return {
            'visible': True,
            'points': points,
            'startPoint': {'x': points[0]['x'], 'y': points[0]['y'], 'rotation': 0},
            'endPoint': {'x': points[-1]['x'], 'y': points[-1]['y'], 'rotation': 180}
        }

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
