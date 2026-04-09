# 个人履历展示网站

一个现代化、高颜值的个人履历展示网站，支持明暗主题切换和响应式设计。

## 🎯 功能特点

- ✨ 现代渐变色彩设计
- 🌓 明暗主题切换
- 📱 完全响应式布局
- ⚡ 流畅的动画效果
- 🔗 小红书、邮箱等联系方式集成
- 💼 项目作品展示
- 🎨 技能展示区域

## 🚀 快速部署到 GitHub Pages

### 方法一：使用 GitHub CLI（推荐）

1. **创建 GitHub 仓库**
   ```bash
   # 如果还没有创建仓库，运行以下命令
   gh repo create yourusername.github.io --public --push --source=.
   ```
   注意：将 `yourusername` 替换为你的 GitHub 用户名

2. **启用 GitHub Pages**
   - 访问你的仓库：https://github.com/yourusername/yourusername.github.io
   - 点击 Settings（设置）
   - 左侧菜单找到 Pages
   - Source 选择 "Deploy from a branch"
   - Branch 选择 "main"，文件夹选择 "/ (root)"
   - 点击 Save

3. **等待部署**
   - 等待 1-2 分钟
   - 访问 https://yourusername.github.io

### 方法二：手动上传

1. Fork 本仓库或下载代码
2. 在 GitHub 创建新仓库
3. 上传所有文件到仓库
4. 按照上面的步骤启用 GitHub Pages

## ⚙️ 自定义配置

编辑 `index.html` 文件中的 `portfolio` 对象：

```javascript
const portfolio = {
  name: "你的姓名",
  title: "职位/头衔",
  shortBio: "一句话介绍",
  longBio: ["第一段介绍", "第二段介绍"],
  email: "your.email@example.com",
  xiaohongshu: {
    name: "小红书ID",
    url: "https://www.xiaohongshu.com/user/profile/xxxxxx"
  },
  socialLinks: [
    {
      platform: "GitHub",
      url: "https://github.com/yourusername",
      icon: "..."
    },
    {
      platform: "LinkedIn",
      url: "https://linkedin.com/in/yourusername",
      icon: "..."
    }
  ],
  skills: [
    {
      title: "技能名称",
      description: "技能描述",
      tags: ["标签1", "标签2"]
    }
  ],
  projects: [
    {
      id: "project-1",
      title: "项目名称",
      description: "项目描述",
      tags: ["React", "Node.js"],
      link: "https://project-link.com"
    }
  ]
};
```

## 📁 项目结构

```
portfolio-website/
├── index.html          # 主页面
├── README.md          # 说明文档
└── SPEC.md            # 设计规范文档
```

## 🎨 技术栈

- HTML5 + CSS3 + JavaScript（纯原生实现，无需构建工具）
- Google Fonts（Noto Serif SC + Inter）
- Lucide Icons（可选）

## 📝 注意事项

- 确保 GitHub 用户名全小写
- 仓库名必须为 `username.github.io` 格式
- 首次部署可能需要等待几分钟

## 📧 联系方式

如有问题或建议，欢迎联系！
