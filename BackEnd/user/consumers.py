import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
import uuid
from datetime import datetime
import logging
import traceback
import asyncio

# 设置日志
logger = logging.getLogger('django.channels')


class CollaborationConsumer(AsyncWebsocketConsumer):
    """
    协作WebSocket消费者
    """

    async def connect(self):
        """
        连接WebSocket
        """
        try:
            self.design_id = self.scope['url_route']['kwargs']['design_id']
            self.room_group_name = f'collaboration_{self.design_id}'

            # 记录连接信息
            client = self.scope.get('client', ['-', '-'])
            logger.info(
                f"WebSocket连接请求: {self.design_id}, 客户端: {client[0]}:{client[1]}")
            logger.info(f"WebSocket路由参数: {self.scope['url_route']}")

            # 记录请求头，但过滤掉敏感信息
            headers = dict(self.scope.get('headers', []))
            if b'authorization' in headers:
                headers[b'authorization'] = b'[FILTERED]'
            logger.info(f"WebSocket请求头: {headers}")

            # 加入房间组
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            # 接受WebSocket连接
            await self.accept()
            logger.info(f"WebSocket连接已接受: {self.design_id}")

            # 发送连接成功消息
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': '连接已建立',
                'timestamp': datetime.now().isoformat(),
                'design_id': self.design_id
            }))
        except Exception as e:
            logger.error(f"WebSocket连接错误: {str(e)}", exc_info=True)
            # 尝试发送错误消息
            try:
                await self.accept()  # 确保连接已接受
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'连接错误: {str(e)}',
                    'timestamp': datetime.now().isoformat()
                }))
                # 短暂延迟后关闭连接
                await asyncio.sleep(1)
                await self.close(code=1011)  # 1011 表示服务器内部错误
            except Exception as close_error:
                logger.error(f"发送错误消息失败: {str(close_error)}")
            raise

    async def disconnect(self, close_code):
        """
        断开WebSocket连接
        """
        try:
            # 离开房间组
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

            logger.info(f"WebSocket连接已断开: {self.design_id}, 代码: {close_code}")
        except Exception as e:
            logger.error(f"断开连接时出错: {str(e)}", exc_info=True)

    async def receive(self, text_data):
        """
        接收WebSocket消息
        """
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')

            # 添加服务器时间戳
            text_data_json['server_timestamp'] = datetime.now().isoformat()

            # 将消息发送到房间组
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'collaboration_message',
                    'message': text_data_json
                }
            )

            logger.info(
                f"收到消息: {message_type}, 发送者: {text_data_json.get('senderId')}")
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析错误: {str(e)}, 数据: {text_data[:100]}...")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'无效的JSON数据: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }))
        except Exception as e:
            logger.error(f"处理消息时出错: {str(e)}")
            logger.error(traceback.format_exc())
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'处理消息时出错: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }))

    async def collaboration_message(self, event):
        """
        处理协作消息
        """
        try:
            message = event['message']

            # 发送消息到WebSocket
            await self.send(text_data=json.dumps(message))
        except Exception as e:
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
