from django.shortcuts import render
from rest_framework import viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Feedback
from .serializers import FeedbackSerializer
from django.contrib.auth.models import User
from user.models import MembershipOrder, UserProfile, MembershipPlan
from user.utils import success_response
from django.db.models import Sum, Count
from datetime import timedelta, date
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from rest_framework.authentication import SessionAuthentication, BasicAuthentication

# Create your views here.


class FeedbackViewSet(viewsets.ModelViewSet):
    """反馈视图集"""
    queryset = Feedback.objects.all()
    serializer_class = FeedbackSerializer

    def get_permissions(self):
        """
        根据不同的操作设置不同的权限：
        - 创建反馈：允许所有用户（包括未登录用户）
        - 其他操作：仅管理员可操作
        """
        if self.action == 'create':
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAdminUser]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        """创建反馈"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return success_response(
            "反馈提交成功，感谢您的反馈！",
            {"data": serializer.data},
            status.HTTP_201_CREATED
        )


@method_decorator(login_required, name='dispatch')
class FeedbackIndexView(APIView):
    """管理仪表盘首页"""
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        # 验证用户是否是管理员
        if not request.user.is_staff:
            return Response({"detail": "您没有权限访问此页面"}, status=status.HTTP_403_FORBIDDEN)

        try:
            # 获取当前日期和时间（使用date对象避免时区问题）
            today = date.today()
            current_month_start = today.replace(day=1)
            last_month_end = current_month_start - timedelta(days=1)
            last_month_start = last_month_end.replace(day=1)
            # 获取当月收入
            current_month_orders = MembershipOrder.objects.filter(
                status='paid',
                payment_time__gte=current_month_start,
                payment_time__lte=today
            )
            print(current_month_orders)
            monthly_income = current_month_orders.aggregate(Sum('amount'))[
                'amount__sum'] or 0

            # 获取上月收入
            last_month_orders = MembershipOrder.objects.filter(
                status='paid',
                payment_time__gte=last_month_start,
                payment_time__lte=last_month_end
            )
            last_month_income = last_month_orders.aggregate(Sum('amount'))[
                'amount__sum'] or 0

            # 计算收入环比增长率
            if last_month_income > 0:
                income_trend = round(
                    ((monthly_income - last_month_income) / last_month_income) * 100, 2)
            else:
                income_trend = 100 if monthly_income > 0 else 0

            # 获取当月新增用户数（使用date字段）
            new_users = User.objects.filter(
                date_joined__gte=current_month_start,
                date_joined__lte=today
            ).count()

            # 获取上月新增用户数
            last_month_new_users = User.objects.filter(
                date_joined__gte=last_month_start,
                date_joined__lte=last_month_end
            ).count()

            # 计算用户环比增长率
            if last_month_new_users > 0:
                user_trend = round(
                    ((new_users - last_month_new_users) / last_month_new_users) * 100, 2)
            else:
                user_trend = 100 if new_users > 0 else 0

            # 获取当前会员数量
            premium_users = UserProfile.objects.filter(
                is_premium=True,
                premium_expire_date__gt=today
            ).count()

            # 获取上月会员数量
            last_month_premium_users = UserProfile.objects.filter(
                is_premium=True,
                premium_expire_date__gt=last_month_start
            ).count()

            # 计算会员环比增长率
            if last_month_premium_users > 0:
                premium_trend = round(
                    ((premium_users - last_month_premium_users) / last_month_premium_users) * 100, 2)
            else:
                premium_trend = 100 if premium_users > 0 else 0

            # 获取总用户数
            total_users = User.objects.count()

            # 获取最近6个月的数据
            six_months_ago = today - timedelta(days=180)
            six_months_ago = six_months_ago.replace(day=1)

            # 准备月份数据
            months = []
            income_data = []
            new_users_data = []
            new_premium_data = []

            for i in range(6):
                month_date = (today - timedelta(days=30*i)).replace(day=1)
                month_end = (month_date.replace(
                    day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
                month_name = month_date.strftime('%Y-%m')
                months.append(month_name)

                # 收入数据
                month_income = MembershipOrder.objects.filter(
                    status='paid',
                    payment_time__gte=month_date,
                    payment_time__lte=month_end
                ).aggregate(Sum('amount'))['amount__sum'] or 0
                income_data.append(float(month_income))

                # 新增用户数据
                month_users = User.objects.filter(
                    date_joined__gte=month_date,
                    date_joined__lte=month_end
                ).count()
                new_users_data.append(month_users)

                # 新增会员数据
                month_premium = MembershipOrder.objects.filter(
                    status='paid',
                    payment_time__gte=month_date,
                    payment_time__lte=month_end
                ).values('user').distinct().count()
                new_premium_data.append(month_premium)

            months.reverse()
            income_data.reverse()
            new_users_data.reverse()
            new_premium_data.reverse()

            # 获取会员计划分布数据
            membership_plans = MembershipPlan.objects.all()
            membership_distribution = []

            for plan in membership_plans:
                plan_users = UserProfile.objects.filter(
                    membership_plan=plan,
                    premium_expire_date__gt=today
                ).count()
                if plan_users > 0:
                    membership_distribution.append({
                        'name': plan.name,
                        'value': plan_users
                    })

            # 获取支付渠道分布数据
            payment_channels_data = MembershipOrder.objects.filter(
                status='paid'
            ).values('payment_channel').annotate(
                count=Count('id')
            )

            payment_channels = []
            channel_display_names = {
                'alipay': '支付宝',
                'wechat': '微信支付',
                'creditcard': '信用卡',
                'other': '其他'
            }

            for channel in payment_channels_data:
                channel_name = channel_display_names.get(
                    channel['payment_channel'], channel['payment_channel'])
                payment_channels.append({
                    'name': channel_name,
                    'value': channel['count']
                })

            # 获取最近10个订单
            recent_orders = MembershipOrder.objects.all().order_by(
                '-created_at')[:10]

            # 准备返回数据
            data = {
                'monthly_income': monthly_income,
                'income_trend': income_trend,
                'new_users': new_users,
                'user_trend': user_trend,
                'premium_users': premium_users,
                'premium_trend': premium_trend,
                'total_users': total_users,
                'income_months': months,
                'income_data': income_data,
                'user_months': months,
                'new_users_data': new_users_data,
                'new_premium_data': new_premium_data,
                'membership_distribution': membership_distribution,
                'payment_channels': payment_channels,
                'recent_orders': [
                    {
                        'id': order.id,
                        'user': order.user.username,
                        'amount': float(order.amount),
                        'status': order.status,
                        'created_at': order.created_at.strftime('%Y-%m-%d %H:%M:%S')
                    } for order in recent_orders
                ]
            }

            return render(request, 'admin/admin.html', data)

        except Exception as e:
            return Response(
                {"detail": f"获取数据时出错: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
