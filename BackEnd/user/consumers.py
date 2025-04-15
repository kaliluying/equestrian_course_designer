"""
协作WebSocket管理模块

该模块实现了基于Django Channels的WebSocket消费者，用于处理马术障碍赛路线设计器的实时协作功能。
主要功能包括：
- 管理WebSocket连接的建立和断开
- 处理用户加入和离开协作会话
- 转发协作消息（障碍物更新、路径更新、光标移动等）
- 维护协作会话状态和协作者列表
- 支持通过链接加入协作（无需认证）
"""

import json  # 用于JSON数据的序列化和反序列化
# Django Channels的异步WebSocket消费者基类
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async  # 用于在异步环境中执行同步数据库操作
from django.contrib.auth.models import User  # Django用户模型
import uuid  # 用于生成唯一标识符
from datetime import datetime  # 用于处理日期和时间
import logging  # 用于日志记录
import traceback  # 用于异常跟踪
import asyncio  # 用于异步IO操作

# 设置日志记录器
logger = logging.getLogger('django.channels')

# 全局字典，用于存储所有活跃的协作会话
# 结构: {design_id: {session_info}}
active_sessions = {}

# 添加获取用户资料的异步方法


@database_sync_to_async
def get_user_profile_info(user):
    """异步获取用户资料信息"""
    if not user or not user.is_authenticated:
        return False
    try:
        profile = user.profile
        if profile.membership_plan.name == '高级会员':
            return True
        return False
    except Exception as e:
        logger.error(f"获取用户资料失败: {str(e)}")
        return False


class CollaborationConsumer(AsyncWebsocketConsumer):
    """
    协作WebSocket消费者类

    负责处理WebSocket连接的生命周期和消息处理，包括：
    - 连接建立和断开
    - 消息接收和发送
    - 协作会话状态管理
    - 协作者信息管理

    该类支持认证用户和匿名用户（通过链接加入）的协作。
    """

    async def connect(self):
        """
        处理WebSocket连接请求
        - 验证用户权限
        - 初始化会话
        - 建立连接
        - 处理协作者加入
        """
        try:
            # 1. 获取基本信息
            self.design_id = self.scope['url_route']['kwargs']['design_id']
            self.room_group_name = f'collaboration_{self.design_id}'
            self.user = self.scope.get('user', None)

            logger.info(f'信息:{self.scope}')

            # 2. 检查是否通过链接加入
            query_string = self.scope.get('query_string', b'').decode('utf-8')

            self.is_via_link = 'via_link=true' in query_string

            # 3. 记录连接信息
            client = self.scope.get('client', ['-', '-'])
            logger.info(
                f"WebSocket连接请求 - 设计ID: {self.design_id}, 客户端: {client[0]}:{client[1]}")
            logger.info(
                f"连接信息 - 用户: {self.user.username if self.user else 'Anonymous'}, 通过链接加入: {self.is_via_link}")

            # 4. 权限检查
            if not self.is_via_link and self.user and self.user.is_authenticated:
                # 检查用户是否是高级会员
                if not await get_user_profile_info(self.user):
                    logger.warning(f"用户 {self.user.username} 不是高级会员，无法创建会话")
                    await self.accept()
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': '只有高级会员才能创建协作会话',
                        'timestamp': datetime.now().isoformat()
                    }))
                    await self.close(code=4003)  # 自定义关闭代码
                    return

            # 5. 加入房间组
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            # 6. 初始化或获取会话
            if self.design_id not in active_sessions:
                logger.info(f"创建新的会话: {self.design_id}")
                active_sessions[self.design_id] = {
                    'id': str(uuid.uuid4()),
                    'design_id': self.design_id,
                    'collaborators': [],
                    'owner': None,
                    'initiator': None,
                    'created_at': datetime.now().isoformat()
                }
                logger.info(f"新会话创建完成: {active_sessions[self.design_id]}")

            # 7. 接受连接
            await self.accept()

            # 8. 发送连接成功消息
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': '连接已建立',
                'timestamp': datetime.now().isoformat(),
                'design_id': self.design_id,
                'session': {
                    'id': active_sessions[self.design_id]['id'],
                    'design_id': self.design_id,
                    'collaborators': active_sessions[self.design_id]['collaborators'],
                    'owner': active_sessions[self.design_id]['owner'],
                    'initiator': active_sessions[self.design_id]['initiator'],
                    'created_at': active_sessions[self.design_id]['created_at']
                }
            }))

            # 9. 处理认证用户加入
            if self.user and self.user.is_authenticated:
                # 确定用户角色
                user_role = 'collaborator'
                if not self.is_via_link and not active_sessions[self.design_id]['initiator']:
                    user_role = 'initiator'

                # 创建协作者信息
                collaborator = {
                    'id': str(self.user.id),
                    'username': self.user.username,
                    'color': self._generate_color(),
                    'role': user_role,
                    'last_active': datetime.now().isoformat()
                }

                # 检查是否已存在
                existing_collaborator = next(
                    (c for c in active_sessions[self.design_id]['collaborators']
                     if c['id'] == str(self.user.id)),
                    None
                )

                if not existing_collaborator:
                    # 添加新协作者
                    active_sessions[self.design_id]['collaborators'].append(
                        collaborator)

                    # 设置所有者和发起者
                    if not active_sessions[self.design_id]['owner']:
                        active_sessions[self.design_id]['owner'] = str(
                            self.user.id)
                    if user_role == 'initiator' and not active_sessions[self.design_id]['initiator']:
                        active_sessions[self.design_id]['initiator'] = str(
                            self.user.id)

                    # 广播加入消息
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'collaboration_message',
                            'message': {
                                'type': 'join',
                                'senderId': str(self.user.id),
                                'senderName': self.user.username,
                                'sessionId': active_sessions[self.design_id]['id'],
                                'timestamp': datetime.now().isoformat(),
                                'payload': {
                                    'session': active_sessions[self.design_id],
                                    'user_role': user_role
                                }
                            }
                        }
                    )
                else:
                    # 更新现有协作者的活跃时间
                    existing_collaborator['last_active'] = datetime.now(
                    ).isoformat()

        except Exception as e:
            # 异常处理
            error_message = f"WebSocket连接错误: {str(e)}"
            logger.error(error_message, exc_info=True)

            try:
                # 确保连接已接受
                if not hasattr(self, 'accepted'):
                    await self.accept()

                # 发送错误消息
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': error_message,
                    'timestamp': datetime.now().isoformat()
                }))

                # 延迟关闭连接
                await asyncio.sleep(1)
                await self.close(code=4000)
            except Exception as close_error:
                logger.error(f"发送错误消息失败: {str(close_error)}")
            raise

    async def disconnect(self, close_code):
        """
        处理WebSocket连接断开

        主要步骤：
        1. 如果用户已认证，将其从协作者列表中移除
        2. 广播离开消息
        3. 如果没有剩余协作者，清理会话
        4. 离开房间组

        参数:
            close_code: WebSocket关闭代码
        """
        try:
            logger.info(
                f"处理WebSocket断开连接: {self.design_id}, 用户: {self.user.username if self.user else 'None'}")

            # 如果用户已认证，将其从协作者列表中移除
            if self.user and self.user.is_authenticated and self.design_id in active_sessions:
                logger.info(f"从协作者列表中移除用户: {self.user.username}")

                # 记录移除前的协作者数量
                before_count = len(
                    active_sessions[self.design_id]['collaborators'])
                logger.info(f"移除前的协作者数量: {before_count}")

                # 移除用户（通过列表推导式过滤）
                active_sessions[self.design_id]['collaborators'] = [
                    c for c in active_sessions[self.design_id]['collaborators']
                    if c['id'] != str(self.user.id)
                ]

                # 记录移除后的协作者数量
                after_count = len(
                    active_sessions[self.design_id]['collaborators'])
                logger.info(f"移除后的协作者数量: {after_count}")

                # 广播离开消息，包含更新后的会话信息
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'collaboration_message',
                        'message': {
                            'type': 'leave',
                            'senderId': str(self.user.id),
                            'senderName': self.user.username,
                            'sessionId': active_sessions[self.design_id]['id'],
                            'timestamp': datetime.now().isoformat(),
                            'payload': {
                                'session': active_sessions[self.design_id]
                            }
                        }
                    }
                )

                # 如果没有协作者了，清理会话
                if not active_sessions[self.design_id]['collaborators']:
                    logger.info(f"没有剩余协作者，清理会话: {self.design_id}")
                    del active_sessions[self.design_id]
                else:
                    logger.info(
                        f"剩余协作者: {active_sessions[self.design_id]['collaborators']}")

            # 离开房间组
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

            logger.info(f"WebSocket连接已断开: {self.design_id}, 代码: {close_code}")
        except Exception as e:
            # 处理断开连接过程中的任何异常
            logger.error(f"断开连接时出错: {str(e)}", exc_info=True)

    async def receive(self, text_data):
        """
        接收并处理WebSocket消息

        主要功能：
        1. 解析接收到的JSON消息
        2. 根据消息类型执行不同的处理逻辑
        3. 更新用户的最后活动时间
        4. 将消息转发到房间组

        支持的消息类型：
        - join: 用户加入消息
        - sync_request: 同步请求
        - 其他类型: 直接转发

        参数:
            text_data: 接收到的文本数据
        """
        try:
            # 解析JSON消息
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            logger.info(
                f"收到消息类型: {message_type}, 发送者: {text_data_json.get('senderId')}")
            logger.info(f"消息内容: {text_data_json}")

            # 添加服务器时间戳
            text_data_json['server_timestamp'] = datetime.now().isoformat()

            # 处理加入消息
            if message_type == 'join' and self.user and self.user.is_authenticated:
                logger.info(f"处理加入消息: {self.user.username}")
                logger.info(f"消息内容: {text_data_json}")

                # 获取用户颜色（从消息中获取或生成新的）
                user_color = text_data_json.get('payload', {}).get(
                    'color', self._generate_color())
                logger.info(f"用户颜色: {user_color}")

                # 确定用户角色
                user_role = 'collaborator'  # 默认为协作者
                if not self.is_via_link and not active_sessions[self.design_id]['initiator']:
                    user_role = 'initiator'  # 如果不是通过链接加入且没有发起者，则设为发起者

                # 创建协作者信息对象
                collaborator = {
                    'id': str(self.user.id),
                    'username': self.user.username,
                    'color': user_color,
                    'role': user_role,
                    'last_active': datetime.now().isoformat()
                }
                logger.info(f"创建协作者信息: {collaborator}")

                # 检查会话是否存在
                if self.design_id in active_sessions:
                    logger.info(f"会话存在: {self.design_id}")
                    # 检查用户是否已经在协作者列表中
                    existing_collaborator = next(
                        (c for c in active_sessions[self.design_id]['collaborators']
                         if c['id'] == collaborator['id']),
                        None
                    )

                    if not existing_collaborator:
                        # 如果用户不在协作者列表中，添加新协作者
                        logger.info(f"添加新协作者: {collaborator}")
                        active_sessions[self.design_id]['collaborators'].append(
                            collaborator)
                        logger.info(
                            f"协作者列表更新后: {active_sessions[self.design_id]['collaborators']}")

                        # 如果是第一个加入的用户，设置为所有者
                        if not active_sessions[self.design_id]['owner']:
                            logger.info(f"设置会话所有者: {self.user.username}")
                            active_sessions[self.design_id]['owner'] = str(
                                self.user.id)

                        # 如果是发起者角色且没有设置发起者，则设置发起者
                        if user_role == 'initiator' and not active_sessions[self.design_id]['initiator']:
                            logger.info(f"设置会话发起者: {self.user.username}")
                            active_sessions[self.design_id]['initiator'] = str(
                                self.user.id)
                    else:
                        # 如果用户已在协作者列表中，更新信息
                        logger.info(f"更新现有协作者: {self.user.username}")
                        existing_collaborator['last_active'] = datetime.now(
                        ).isoformat()
                        existing_collaborator['color'] = collaborator['color']
                        logger.info(f"更新后的协作者信息: {existing_collaborator}")

                    logger.info(
                        f"当前协作者列表: {active_sessions[self.design_id]['collaborators']}")
                    logger.info(
                        f"当前协作者数量: {len(active_sessions[self.design_id]['collaborators'])}")

                    # 构建加入消息
                    join_message = {
                        'type': 'join',
                        'senderId': str(self.user.id),
                        'senderName': self.user.username,
                        'sessionId': active_sessions[self.design_id]['id'],
                        'timestamp': datetime.now().isoformat(),
                        'payload': {
                            'session': active_sessions[self.design_id],
                            'user_role': user_role  # 添加用户角色信息
                        }
                    }
                    logger.info(f"构建加入消息: {join_message}")

                    # 广播更新后的会话信息
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'collaboration_message',
                            'message': join_message
                        }
                    )
                    logger.info("加入消息已广播")

                    # 直接发送响应给当前用户
                    await self.send(text_data=json.dumps(join_message))
                    logger.info("已直接发送加入消息响应给当前用户")
                    return
                else:
                    # 会话不存在，发送错误消息
                    logger.error(f"处理加入消息时会话不存在: {self.design_id}")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': '会话不存在',
                        'timestamp': datetime.now().isoformat()
                    }))
                    return

            # 处理同步请求
            elif message_type == 'sync_request' and self.design_id in active_sessions:
                logger.info(
                    f"处理同步请求: {self.user.username if self.user else 'Unknown'}")
                logger.info(f"当前会话信息: {active_sessions[self.design_id]}")
                logger.info(
                    f"当前协作者列表: {active_sessions[self.design_id]['collaborators']}")

                # 确保用户在协作者列表中
                if self.user and self.user.is_authenticated:
                    user_id = str(self.user.id)
                    # 检查用户是否在协作者列表中
                    existing_collaborator = next(
                        (c for c in active_sessions[self.design_id]['collaborators']
                         if c['id'] == user_id),
                        None
                    )

                    # 确定用户角色
                    user_role = 'collaborator'  # 默认为协作者
                    if not self.is_via_link and not active_sessions[self.design_id]['initiator']:
                        user_role = 'initiator'  # 如果不是通过链接加入且没有发起者，则设为发起者

                    # 如果用户不在协作者列表中，添加用户
                    if not existing_collaborator:
                        logger.info(f"同步请求时添加用户到协作者列表: {self.user.username}")
                        collaborator = {
                            'id': user_id,
                            'username': self.user.username,
                            'color': self._generate_color(),
                            'role': user_role,
                            'last_active': datetime.now().isoformat()
                        }
                        active_sessions[self.design_id]['collaborators'].append(
                            collaborator)

                        # 如果是第一个加入的用户，设置为所有者
                        if not active_sessions[self.design_id]['owner']:
                            logger.info(f"设置会话所有者: {self.user.username}")
                            active_sessions[self.design_id]['owner'] = user_id

                        # 如果是发起者角色且没有设置发起者，则设置发起者
                        if user_role == 'initiator' and not active_sessions[self.design_id]['initiator']:
                            logger.info(f"设置会话发起者: {self.user.username}")
                            active_sessions[self.design_id]['initiator'] = user_id
                    else:
                        # 更新用户的活跃时间
                        existing_collaborator['last_active'] = datetime.now(
                        ).isoformat()

                # 构建同步响应消息
                sync_response = {
                    'type': 'sync_response',
                    'senderId': 'server',
                    'senderName': 'System',
                    'sessionId': active_sessions[self.design_id]['id'],
                    'timestamp': datetime.now().isoformat(),
                    'payload': {
                        'session': active_sessions[self.design_id]
                    }
                }

                # 发送同步响应给请求用户
                logger.info(f"发送同步响应: {sync_response}")
                await self.send(text_data=json.dumps(sync_response))

                # 广播会话更新消息给所有用户
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'collaboration_message',
                        'message': {
                            'type': 'session_update',
                            'senderId': 'server',
                            'senderName': 'System',
                            'sessionId': active_sessions[self.design_id]['id'],
                            'timestamp': datetime.now().isoformat(),
                            'payload': {
                                'session': active_sessions[self.design_id]
                            }
                        }
                    }
                )
                logger.info(
                    f"已广播会话更新消息，当前协作者数量: {len(active_sessions[self.design_id]['collaborators'])}")
                return

            # 更新用户的最后活动时间
            if (self.user and self.user.is_authenticated and
                    self.design_id in active_sessions):
                for collaborator in active_sessions[self.design_id]['collaborators']:
                    if collaborator['id'] == str(self.user.id):
                        collaborator['last_active'] = datetime.now(
                        ).isoformat()
                        break

            # 将消息发送到房间组（广播给所有连接的客户端）
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'collaboration_message',
                    'message': text_data_json
                }
            )

            logger.info(f"消息已转发: {message_type}")
        except json.JSONDecodeError as e:
            # 处理JSON解析错误
            logger.error(f"JSON解析错误: {str(e)}, 数据: {text_data[:100]}...")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'无效的JSON数据: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }))
        except Exception as e:
            # 处理其他异常
            logger.error(f"处理消息时出错: {str(e)}")
            logger.error(traceback.format_exc())
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'处理消息时出错: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }))

    async def collaboration_message(self, event):
        """
        处理从房间组接收到的协作消息并发送给客户端

        这个方法由channel_layer.group_send调用，用于将消息发送给特定的WebSocket连接。

        参数:
            event: 包含消息内容的事件对象
        """
        try:
            # 从事件中获取消息
            message = event['message']

            # 发送消息到WebSocket客户端
            await self.send(text_data=json.dumps(message))
        except Exception as e:
            # 处理发送消息过程中的异常
            logger.error(f"发送消息时出错: {str(e)}", exc_info=True)
            # 尝试发送错误消息
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'发送消息时出错: {str(e)}',
                    'timestamp': datetime.now().isoformat()
                }))
            except Exception as send_error:
                logger.error(f"发送错误消息失败: {str(send_error)}")

    def _generate_color(self):
        """
        为用户生成随机颜色

        使用用户ID的哈希值来确保同一用户始终获得相同的颜色。

        返回:
            str: 十六进制颜色代码
        """
        colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA5A5', '#A5FFD6',
            '#FFC145', '#FF6B8B', '#845EC2', '#D65DB1', '#FF9671'
        ]
        return colors[hash(str(self.user.id)) % len(colors)]
