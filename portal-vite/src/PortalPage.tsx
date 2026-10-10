// D+ 方案：直接复用主项目 Next 页面组件（零拷贝，单一事实源）
// page.tsx 为纯客户端 React 组件，"use client" 指令在 vite 下无副作用
export { default } from "@/app/page";
