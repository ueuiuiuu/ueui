# OpenGL 与图形渲染

## 一、OpenGL 是什么

OpenGL 是接口，从 CPU 侧调用底层函数，控制 GPU 的显示。GPU 会由不同驱动来适配不同的接口，比如 Vulkan。近期游戏《我的世界》更新，将逐步用 Vulkan 取代 OpenGL：一是苹果 macOS 不再支持，二是 OpenGL 的状态同时只能绑定一个线程，多核性能无法发挥。

很多模型在演示其效果时，会使用 3D 的体素 Demo 来呈现，其中很多使用了 Three.js。Three.js 底层会使用到 WebGL，而 WebGL 则是基于 OpenGL 来进行渲染的。

为了阐释 OpenGL 的作用，下面先解释图像是如何渲染到屏幕的。

## 二、图像如何渲染到屏幕

基本上，图像由顶点、贴图、颜色之类的构成。一般，这些信息会从 CPU 给到 GPU，进而经过图形流水线渲染到显示器上。具体过程为：

```text
CPU → GPU（Vertex 节点 → 光栅化 → Fragment 节点）
```

- **Vertex**：可大致理解为，此处会处理顶点的平移、旋转、缩放（将顶点和最终矩阵相乘）。
- **光栅化**：简要理解为通过硬件固定的中点画线/画圆（Bresenham 算法）、扫描线填充、种子填充等算法确定面与覆盖范围。
- **Fragment 节点**：则为前面确定的面添加颜色、贴图、光影等属性。

而 Vertex 和 Fragment 部分，是可以有一定的内存用于细化的计算，可以通过 shader 使用这部分内存，对节点处理过程产生影响，获取更细致的效果。

## 三、矩阵栈与全局状态机

### 入栈与出栈

OpenGL 的接口，具体提供了 `glLoadIdentity`（初始化单位矩阵），以及入栈、出栈、平移、缩放等函数。调用入栈函数时，其会复制栈顶矩阵，再放入栈顶矩阵。我们可以通过伪代码：

```text
变换1 → 入栈 → 变换2 → primitive P1 → 出栈 → 入栈 → 变换3 → primitive P2
```

（`→` 可视为回车）实现对 P1 顶点集进行变换1、2 操作后绘制，对 P2 顶点集进行变换1、3 后绘制。

### 变换即矩阵乘法

OpenGL 作为某种全局状态机，其状态最终会被输入到图形流水线去渲染。其含义是：我们通过编写其程序对全局的不同变量进行修改，从而影响绘制过程。

比如，当我们期望对一个图形进行缩放时，我们实际上会对 P（图形顶点的矩阵）进行矩阵运算，最终得出一个 M 矩阵，给到流水线，进行 `P' = M * P` 的结果的绘制。当我们移动时，`P' = P + deltaM` 可以被化为矩阵乘法；进行缩放时会 `P' = K * P`。

而对于不以原点为中心的图形，原点放大两倍，`(2, 3, 4)` 作为顶点时直接变为 `(4, 6, 8)`，实际上会使得图形远离原点。通常我们会移动图形到原点进行缩放，再逆向移动回去。

### 纹理作为全局状态

再比如，我们可以设置全局状态中的纹理，使其在 fragment 处理时进行渲染。

### 类比：Agent 的全局 Context

与之类似的，比如 Agent，我们传入不同的全局状态 Context，从而在 loop 中影响 LLM 的输出，根据输出结果调用不同程序，实现不同效果。此处给出两个伪代码，对照两者的主循环骨架：

OpenGL 的主循环：

```text
main() {
    加载建模信息给到全局状态
    while (!quit) {
        确认当前相机视角
        确认动画
        P' = M * P          // 做最后计算
        Draw()              // 给到 GPU 流水线渲染
        Shader 设置细化
    }
}
```

Agent 的主循环：

```text
func {
    加载上下文
    while (true) {
        Resp = Req_LLM(上下文)
        解析 Resp，进行工具调用或退出
    }
    输出本次响应
}
```

## 四、这些知识的用处

这些知识将使我们更理解一些事情。

比如《我的世界》地平线模组，通过将远距离的很多方块平均为一个巨型方块，从而降低了顶点数，减少 CPU 内存占用，实现更远视距（本站点中的两个存档的差异之一就是顶点数和内存占用[点击跳转](https://ueuiuiuu.github.io/ueui/market/recalltry/)）。画面中一些动态效果，可能是通过 shader 实现的实时演算。

## 五、用 CPU 手动实现图形流水线

简略来看，OpenGL 实现了下面的操作：Vertex（构建图元 + 裁剪）→ 光栅化（扫描算法）→ fragment（Z-Buffer）→ 帧缓冲区，这些操作已硬化。但我们也可以通过 CPU 计算来实现上述操作，从而进一步理解：

```cpp
void glEnd() {
    // 确定状态正常（否则 return）

    // 通过顶点和索引获取图元数组，即将边相连的顶点分为一组
    vector<array<int, 3>> prims;

    // 用 transformVertex(v, normalMat) 做最后一步变换，获取到的新顶点给到 clipVerts
    vector<ClipVertex> clipVerts;

    // 后面通过遍历 prims，直接画线（比如中点画线），然后做裁剪（比如 Cohen-Sutherland）
    for (const array<int, 3>& p : prims) {
        ScreenVertex sa = toScreen(clipVerts[size_t(p[0])]);
        ScreenVertex sb = toScreen(clipVerts[size_t(p[1])]);
        rasterLine(sa, sb); // 这里是传入经过透视、视口变换得到的最终顶点进行画线
    }

    // 做光栅化操作（比如扫描线填充）
    scanlinePolygon(*g.fb, poly, toColor(g.currentColor), false);

    // 显示到屏幕
}
```
