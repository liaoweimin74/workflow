// ----- Task 3.1 测试共享 fixture：客户端配置（启用页面清单）-----
// 单独放 fixture 文件而不是某个 *.test.ts 里：测试文件互相导入会让被导入方的
// describe/it 在导入方上下文里重复注册。
import type { UniClientConfig } from '../../uni/project-files'

export const CLIENT: UniClientConfig = {
  key: 'member',
  name: '会员端',
  appid: 'wx1234',
  pages: [
    { key: 'home', title: '首页' },
    { key: 'orders', title: '我的订单' },
  ],
}
