function exportDesign(designId) {
  // 发送导出请求到后端
  fetch(`/api/designs/${designId}/export/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
  })
    .then((response) => response.blob())
    .then((blob) => {
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `design_${designId}_export.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    })
    .catch((error) => {
      console.error("导出失败:", error);
      alert("导出失败，请稍后重试");
    });
}

// 获取 CSRF Token
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// 下载文件函数
function downloadFile(url, filename) {
  // 创建一个隐藏的a标签
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename || "";
  document.body.appendChild(a);

  // 触发点击事件
  a.click();

  // 清理
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// 图片预览功能
function showImagePreview(imageUrl, title) {
  // 创建模态框容器
  const modal = document.createElement("div");
  modal.className = "image-preview-modal";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  modal.style.display = "flex";
  modal.style.flexDirection = "column";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "9999";
  modal.style.padding = "20px";
  modal.style.boxSizing = "border-box";
  modal.style.overflow = "auto";

  // 创建标题
  if (title) {
    const titleElement = document.createElement("h3");
    titleElement.textContent = title;
    titleElement.style.color = "white";
    titleElement.style.marginBottom = "20px";
    titleElement.style.textAlign = "center";
    modal.appendChild(titleElement);
  }

  // 创建图片容器
  const imgContainer = document.createElement("div");
  imgContainer.style.position = "relative";
  imgContainer.style.maxWidth = "90%";
  imgContainer.style.maxHeight = "80%";
  imgContainer.style.overflow = "auto";
  imgContainer.style.backgroundColor = "white";
  imgContainer.style.padding = "10px";
  imgContainer.style.borderRadius = "5px";
  imgContainer.style.boxShadow = "0 0 20px rgba(0, 0, 0, 0.5)";

  // 创建图片元素
  const img = document.createElement("img");
  img.src = imageUrl;
  img.style.display = "block";
  img.style.maxWidth = "100%";
  img.style.maxHeight = "calc(80vh - 100px)";
  img.style.margin = "0 auto";
  imgContainer.appendChild(img);

  // 创建关闭按钮
  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.className = "el-button el-button--danger el-button--small";
  closeButton.style.position = "absolute";
  closeButton.style.top = "10px";
  closeButton.style.right = "10px";
  closeButton.style.fontSize = "20px";
  closeButton.style.width = "30px";
  closeButton.style.height = "30px";
  closeButton.style.display = "flex";
  closeButton.style.alignItems = "center";
  closeButton.style.justifyContent = "center";
  closeButton.style.padding = "0";
  closeButton.style.cursor = "pointer";
  closeButton.style.borderRadius = "50%";
  closeButton.onclick = function () {
    document.body.removeChild(modal);
  };
  imgContainer.appendChild(closeButton);

  // 添加下载按钮
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "下载图片";
  downloadButton.className = "el-button el-button--primary el-button--small";
  downloadButton.style.display = "block";
  downloadButton.style.margin = "10px auto 0";
  downloadButton.onclick = function () {
    downloadFile(imageUrl, title ? `${title}.png` : "image.png");
  };
  imgContainer.appendChild(downloadButton);

  modal.appendChild(imgContainer);

  // 点击模态框背景关闭
  modal.onclick = function (event) {
    if (event.target === modal) {
      document.body.removeChild(modal);
    }
  };

  // 添加到页面
  document.body.appendChild(modal);

  // 添加ESC键关闭功能
  const escHandler = function (e) {
    if (e.key === "Escape") {
      document.body.removeChild(modal);
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}
