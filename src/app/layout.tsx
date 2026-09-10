import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "工作流低代码平台 - 控制台",
  description:
    "基于 Flowable 8 的工作流低代码平台：流程设计器、表单设计器、列表视图设计与流程执行引擎",
  keywords: ["Flowable", "工作流", "低代码", "BPMN", "表单设计器"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
