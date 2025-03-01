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
