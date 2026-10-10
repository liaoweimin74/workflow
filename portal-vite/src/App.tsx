import PortalPage from "../../src/app/page";
import { Toaster } from "@/components/ui/toaster";

/**
 * 门户壳组件 —— 镜像原 src/app/layout.tsx 的 body 结构：
 * <PortalPage/>（原 page.tsx，default export）+ 全局 <Toaster/>
 * 页面本体不复制代码，直接引用原文件（单一事实来源，后续只维护 page.tsx）。
 */
export default function App() {
  return (
    <>
      <PortalPage />
      <Toaster />
    </>
  );
}
