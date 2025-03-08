/**
 * 自定义障碍物管理界面的JavaScript增强
 */
(function () {
  // 等待DOM加载完成
  document.addEventListener("DOMContentLoaded", function () {
    // 美化JSON显示
    formatJsonFields();

    // 添加障碍物数据变更监听
    addObstacleDataChangeListener();

    // 检查预览是否正常显示
    checkPreviewDisplay();

    // 添加自动修复按钮
    addAutoFixButtons();
  });

  /**
   * 格式化JSON字段，使其更易读
   */
  function formatJsonFields() {
    // 查找所有textarea，检查是否为JSON字段
    const textareas = document.querySelectorAll("textarea");

    textareas.forEach(function (textarea) {
      // 检查是否是障碍物数据字段
      if (textarea.id.includes("obstacle_data")) {
        try {
          // 尝试解析JSON
          let jsonData = textarea.value;
          
          // 如果是字符串形式的JSON，先解析
          if (typeof jsonData === "string") {
            jsonData = JSON.parse(jsonData);
          }
          
          // 确保baseType字段存在
          if (!jsonData.baseType) {
            console.warn("障碍物数据缺少baseType字段");
            // 尝试从数据中推断类型
            if (jsonData.decorationProperties) {
              jsonData.baseType = "DECORATION";
              console.log("自动推断类型为: DECORATION");
            } else if (jsonData.gap) {
              jsonData.baseType = "DOUBLE";
              console.log("自动推断类型为: DOUBLE");
            } else if (jsonData.width && jsonData.height) {
              jsonData.baseType = "SINGLE";
              console.log("自动推断类型为: SINGLE");
            }
          }
          
          // 格式化JSON并更新textarea
          textarea.value = JSON.stringify(jsonData, null, 2);
          
          // 调整textarea的大小
          textarea.style.fontFamily = "monospace";
          textarea.style.fontSize = "14px";
          textarea.style.minHeight = "300px";
          textarea.style.width = "100%";
        } catch (e) {
          console.error("JSON解析失败:", e);
          // 添加错误提示
          const errorDiv = document.createElement("div");
          errorDiv.className = "error-message";
          errorDiv.style.color = "#f56c6c";
          errorDiv.style.marginTop = "5px";
          errorDiv.textContent = "JSON格式错误: " + e.message;
          textarea.parentNode.appendChild(errorDiv);
        }
      }
    });
  }

  /**
   * 添加障碍物数据变更监听，实时更新预览
   */
  function addObstacleDataChangeListener() {
    // 查找障碍物数据字段
    const obstacleDataFields = document.querySelectorAll(
      'textarea[id*="obstacle_data"]'
    );

    obstacleDataFields.forEach(function (field) {
      field.addEventListener("change", function () {
        // 当数据变更时，提示用户保存以更新预览
        const message = document.createElement("div");
        message.className = "info";
        message.style.color = "#31708f";
        message.style.backgroundColor = "#d9edf7";
        message.style.padding = "10px";
        message.style.marginTop = "10px";
        message.style.borderRadius = "4px";
        message.style.border = "1px solid #bce8f1";
        message.innerHTML = "障碍物数据已修改，请保存以更新预览。";

        // 查找预览区域
        const previewField = document.querySelector(".field-preview_obstacle");

        // 如果找到预览区域，在其后添加提示
        if (previewField) {
          // 检查是否已经有提示
          const existingMessage = previewField.querySelector(".info");
          if (existingMessage) {
            existingMessage.remove();
          }

          previewField.appendChild(message);
        }
        
        // 验证JSON格式
        try {
          const jsonData = JSON.parse(field.value);
          
          // 检查必要字段
          if (!jsonData.baseType) {
            const warningDiv = document.createElement("div");
            warningDiv.className = "warning-message";
            warningDiv.style.color = "#e6a23c";
            warningDiv.style.marginTop = "5px";
            warningDiv.textContent = "警告: 缺少baseType字段，预览可能无法正确显示";
            
            // 移除已有警告
            const existingWarning = field.parentNode.querySelector(".warning-message");
            if (existingWarning) {
              existingWarning.remove();
            }
            
            field.parentNode.appendChild(warningDiv);
          }
        } catch (e) {
          // JSON格式错误
          const errorDiv = document.createElement("div");
          errorDiv.className = "error-message";
          errorDiv.style.color = "#f56c6c";
          errorDiv.style.marginTop = "5px";
          errorDiv.textContent = "JSON格式错误: " + e.message;
          
          // 移除已有错误提示
          const existingError = field.parentNode.querySelector(".error-message");
          if (existingError) {
            existingError.remove();
          }
          
          field.parentNode.appendChild(errorDiv);
        }
      });
    });
  }

  /**
   * 检查预览是否正常显示
   */
  function checkPreviewDisplay() {
    // 查找所有预览区域
    const previewAreas = document.querySelectorAll(".field-preview_obstacle");
    
    previewAreas.forEach(function (area) {
      // 检查是否包含"未知类型"文本
      if (area.textContent.includes("未知类型")) {
        // 添加提示信息
        const helpDiv = document.createElement("div");
        helpDiv.style.color = "#409eff";
        helpDiv.style.marginTop = "10px";
        helpDiv.style.fontSize = "12px";
        helpDiv.style.padding = "10px";
        helpDiv.style.backgroundColor = "#ecf5ff";
        helpDiv.style.borderRadius = "4px";
        helpDiv.style.border = "1px solid #d9ecff";
        helpDiv.innerHTML = "提示: 障碍物显示为"未知类型"，请检查障碍物数据中是否包含<span style='background-color: #f8f8f8; padding: 2px 4px; border-radius: 3px; font-family: monospace;'>baseType</span>字段，" +
                           "可能的值有: SINGLE, DOUBLE, WALL, LIVERPOOL, DECORATION";
        
        area.appendChild(helpDiv);
      }
    });
  }

  /**
   * 添加自动修复按钮
   */
  function addAutoFixButtons() {
    // 查找所有预览区域
    const previewAreas = document.querySelectorAll('.field-preview_obstacle');
    
    previewAreas.forEach(function(area) {
      // 检查是否包含"未知类型"文本
      if (area.textContent.includes('未知类型')) {
        // 创建自动修复按钮
        const fixButton = document.createElement('button');
        fixButton.type = 'button';
        fixButton.style.color = '#fff';
        fixButton.style.backgroundColor = '#409eff';
        fixButton.style.borderColor = '#409eff';
        fixButton.style.padding = '9px 15px';
        fixButton.style.fontSize = '12px';
        fixButton.style.borderRadius = '3px';
        fixButton.style.cursor = 'pointer';
        fixButton.style.marginTop = '10px';
        fixButton.style.marginRight = '10px';
        fixButton.style.border = '1px solid #409eff';
        fixButton.textContent = '尝试自动修复';
        
        // 添加点击事件
        fixButton.addEventListener('click', function() {
          // 查找障碍物数据字段
          const dataField = document.querySelector('textarea[id*="obstacle_data"]');
          if (!dataField) return;
          
          try {
            // 解析JSON
            let jsonData = JSON.parse(dataField.value);
            
            // 检查是否缺少baseType字段
            if (!jsonData.baseType) {
              // 尝试推断类型
              if (jsonData.decorationProperties) {
                jsonData.baseType = 'DECORATION';
                
                // 确保decorationProperties是对象
                if (typeof jsonData.decorationProperties === 'string') {
                  try {
                    jsonData.decorationProperties = JSON.parse(jsonData.decorationProperties);
                  } catch (e) {
                    jsonData.decorationProperties = {};
                  }
                }
                
                // 确保decorationProperties有必要的属性
                if (!jsonData.decorationProperties.category) {
                  jsonData.decorationProperties.category = 'PLANT';
                }
                if (!jsonData.decorationProperties.color) {
                  jsonData.decorationProperties.color = '#228B22';
                }
                if (!jsonData.decorationProperties.width) {
                  jsonData.decorationProperties.width = 50;
                }
                if (!jsonData.decorationProperties.height) {
                  jsonData.decorationProperties.height = 50;
                }
              } else if (jsonData.gap) {
                jsonData.baseType = 'DOUBLE';
              } else if (jsonData.width && jsonData.height) {
                jsonData.baseType = 'SINGLE';
              } else {
                // 默认设置为单横木
                jsonData.baseType = 'SINGLE';
                // 如果缺少必要属性，添加默认值
                if (!jsonData.width) jsonData.width = 100;
                if (!jsonData.height) jsonData.height = 20;
                if (!jsonData.color) jsonData.color = '#8B4513';
              }
              
              // 更新数据字段
              dataField.value = JSON.stringify(jsonData, null, 2);
              
              // 添加成功提示
              const successDiv = document.createElement('div');
              successDiv.style.color = '#67c23a';
              successDiv.style.backgroundColor = '#f0f9eb';
              successDiv.style.padding = '10px';
              successDiv.style.marginTop = '10px';
              successDiv.style.borderRadius = '4px';
              successDiv.style.border = '1px solid #c2e7b0';
              successDiv.innerHTML = `已自动设置类型为: <strong>${jsonData.baseType}</strong>，请点击保存按钮更新预览。`;
              
              area.appendChild(successDiv);
              
              // 提示用户保存
              const saveButton = document.querySelector('input[name="_save"]');
              if (saveButton) {
                saveButton.style.animation = 'pulse 1s infinite';
                saveButton.style.boxShadow = '0 0 10px rgba(64, 158, 255, 0.5)';
              }
            } else {
              // 已有类型，显示提示
              const infoDiv = document.createElement('div');
              infoDiv.style.color = '#909399';
              infoDiv.style.backgroundColor = '#f4f4f5';
              infoDiv.style.padding = '10px';
              infoDiv.style.marginTop = '10px';
              infoDiv.style.borderRadius = '4px';
              infoDiv.style.border = '1px solid #e9e9eb';
              infoDiv.textContent = `障碍物已有类型: ${jsonData.baseType}，无需修复。`;
              
              area.appendChild(infoDiv);
            }
          } catch (e) {
            // JSON解析错误
            const errorDiv = document.createElement('div');
            errorDiv.style.color = '#f56c6c';
            errorDiv.style.backgroundColor = '#fef0f0';
            errorDiv.style.padding = '10px';
            errorDiv.style.marginTop = '10px';
            errorDiv.style.borderRadius = '4px';
            errorDiv.style.border = '1px solid #fbc4c4';
            errorDiv.textContent = `JSON解析错误: ${e.message}`;
            
            area.appendChild(errorDiv);
          }
        });
        
        area.appendChild(fixButton);
      }
    });
  }
})();
