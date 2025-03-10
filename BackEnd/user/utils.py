import json
from alipay.utils import AliPayConfig
from alipay import AliPay
from django.conf import settings
from urllib.parse import urljoin
import random
import string
from hashlib import sha1
import time
import os
import uuid


def get_absolute_media_url(path):
    """
    生成绝对媒体URL，确保在不同环境中使用正确的域名

    Args:
        path: 相对路径

    Returns:
        完整的URL路径
    """
    # 构建协议
    protocol = 'https' if settings.USE_HTTPS else 'http'

    # 构建基础URL
    base_url = f"{protocol}://{settings.SITE_DOMAIN}"

    # 确保路径以'/'开头
    if not path.startswith('/'):
        path = '/' + path

    # 返回完整URL
    return urljoin(base_url, path)


def generate_token():
    """生成一个随机令牌"""
    random_str = ''.join(random.choices(
        string.ascii_letters + string.digits, k=24))
    timestamp = str(int(time.time()))
    token_id = str(uuid.uuid4())
    # 使用SHA1哈希组合以上元素
    raw_token = f"{random_str}:{timestamp}:{token_id}"
    token = sha1(raw_token.encode()).hexdigest()
    return token


# 支付宝支付相关工具

# 初始化支付宝客户端

def get_alipay_client():
    """
    获取支付宝客户端实例
    需要在settings.py中配置以下参数:
    - ALIPAY_APPID: 支付宝应用ID
    - ALIPAY_APP_PRIVATE_KEY_PATH: 应用私钥路径
    - ALIPAY_ALIPAY_PUBLIC_KEY_PATH: 支付宝公钥路径
    - ALIPAY_NOTIFY_URL: 支付宝异步通知URL
    - ALIPAY_RETURN_URL: 支付宝同步返回URL
    - ALIPAY_DEBUG: 是否为沙箱环境(布尔值)
    """
    app_private_key_string = open(settings.ALIPAY_APP_PRIVATE_KEY_PATH).read()
    alipay_public_key_string = open(
        settings.ALIPAY_ALIPAY_PUBLIC_KEY_PATH).read()

    alipay = AliPay(
        appid=settings.ALIPAY_APPID,
        app_notify_url=settings.ALIPAY_NOTIFY_URL,  # 默认回调url
        app_private_key_string=app_private_key_string,
        alipay_public_key_string=alipay_public_key_string,
        sign_type="RSA2",
        debug=settings.ALIPAY_DEBUG,  # 默认False，True表示使用沙箱环境
        config=AliPayConfig(timeout=15)  # 可选，请求超时时间
    )
    return alipay


def create_alipay_order(order_id, subject, total_amount, return_url=None):
    """
    创建支付宝支付订单，返回支付链接

    参数:
    - order_id: 订单号，必须唯一
    - subject: 订单标题
    - total_amount: 订单金额(元)，字符串类型如"88.88"
    - return_url: 支付成功后的跳转URL，不传则使用默认配置

    返回:
    - pay_url: 支付链接
    """
    alipay = get_alipay_client()

    # 电脑网站支付，需要跳转到https://openapi.alipay.com/gateway.do? + order_string
    order_string = alipay.api_alipay_trade_page_pay(
        out_trade_no=order_id,
        total_amount=str(total_amount),  # 一定要转换为字符串
        subject=subject,
        return_url=return_url or settings.ALIPAY_RETURN_URL,
        notify_url=settings.ALIPAY_NOTIFY_URL  # 可选，不传则使用初始化时的值
    )

    # 支付宝网关地址
    if settings.ALIPAY_DEBUG:  # 沙箱环境
        alipay_gateway = "https://openapi-sandbox.dl.alipaydev.com/gateway.do?"
    else:  # 正式环境
        alipay_gateway = "https://openapi.alipay.com/gateway.do?"

    # 完整的支付链接
    pay_url = f"{alipay_gateway}{order_string}"
    return pay_url


def verify_alipay_callback(data, signature):
    """
    验证支付宝异步通知的签名

    参数:
    - data: 回调数据(字典)
    - signature: 支付宝返回的签名

    返回:
    - verified: 是否验证通过(布尔值)
    """
    alipay = get_alipay_client()
    return alipay.verify(data, signature)


def query_alipay_order(order_id):
    """
    查询支付宝订单状态

    参数:
    - order_id: 订单号

    返回:
    - 订单查询结果(字典)
    """
    alipay = get_alipay_client()
    return alipay.api_alipay_trade_query(out_trade_no=order_id)
