<template>
    <div class="feedback-container">
        <h1>用户反馈</h1>
        <p class="feedback-intro">
            感谢您使用我们的马术障碍赛路线设计器！我们非常重视您的意见和建议，请通过以下表单提交您的反馈。
        </p>

        <el-card class="feedback-card">
            <el-form ref="feedbackFormRef" :model="feedbackForm" :rules="rules" label-position="top"
                @submit.prevent="submitFeedback">
                <el-form-item label="反馈类型" prop="type">
                    <el-select v-model="feedbackForm.type" placeholder="请选择反馈类型" class="w-100">
                        <el-option label="功能建议" value="feature" />
                        <el-option label="问题报告" value="bug" />
                        <el-option label="用户体验" value="ux" />
                        <el-option label="其他" value="other" />
                    </el-select>
                </el-form-item>

                <el-form-item label="标题" prop="title">
                    <el-input v-model="feedbackForm.title" placeholder="请简要描述您的反馈" />
                </el-form-item>

                <el-form-item label="详细描述" prop="content">
                    <el-input v-model="feedbackForm.content" type="textarea" :rows="6"
                        placeholder="请详细描述您的反馈内容，包括您遇到的问题或建议的功能等" />
                </el-form-item>

                <el-form-item label="联系方式（选填）" prop="contact">
                    <el-input v-model="feedbackForm.contact" placeholder="您的邮箱或其他联系方式，以便我们回复您" />
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="submitting">提交反馈</el-button>
                    <el-button @click="resetForm">重置</el-button>
                </el-form-item>
            </el-form>
        </el-card>

        <!-- 成功提示 -->
        <el-dialog v-model="showSuccessDialog" title="反馈提交成功" width="30%" center>
            <div class="success-content">
                <el-icon class="success-icon">
                    <CircleCheckFilled />
                </el-icon>
                <p>感谢您的反馈！我们会认真考虑您的意见和建议。</p>
            </div>
            <template #footer>
                <span class="dialog-footer">
                    <el-button type="primary" @click="showSuccessDialog = false">确定</el-button>
                </span>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { submitUserFeedback } from '@/api/feedback'

// 表单引用
const feedbackFormRef = ref()

// 表单数据
const feedbackForm = reactive({
    type: '',
    title: '',
    content: '',
    contact: ''
})

// 表单验证规则
const rules = {
    type: [{ required: true, message: '请选择反馈类型', trigger: 'change' }],
    title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
    content: [{ required: true, message: '请输入详细描述', trigger: 'blur' }],
    contact: [
        {
            pattern: /^$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            message: '请输入有效的邮箱地址',
            trigger: 'blur'
        }
    ]
}

// 提交状态
const submitting = ref(false)
const showSuccessDialog = ref(false)

// 提交反馈
const submitFeedback = async () => {
    if (!feedbackFormRef.value) return

    await feedbackFormRef.value.validate(async (valid: boolean) => {
        if (valid) {
            submitting.value = true
            try {
                await submitUserFeedback(feedbackForm)
                showSuccessDialog.value = true
                resetForm()
            } catch (error) {
                console.error('提交反馈失败:', error)
                ElMessage.error('提交反馈失败，请稍后重试')
            } finally {
                submitting.value = false
            }
        }
    })
}

// 重置表单
const resetForm = () => {
    if (feedbackFormRef.value) {
        feedbackFormRef.value.resetFields()
    }
}
</script>

<style scoped>
.feedback-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.feedback-intro {
    margin-bottom: 20px;
    color: #606266;
    line-height: 1.6;
}

.feedback-card {
    margin-bottom: 30px;
}

.w-100 {
    width: 100%;
}

.success-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px 0;
}

.success-icon {
    font-size: 48px;
    color: #67c23a;
    margin-bottom: 15px;
}
</style>
