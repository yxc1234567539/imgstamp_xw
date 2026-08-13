# imgstamp_xw

在图片文件头**无损**添加自定义字符串标记,支持 PNG / JPEG / GIF 三种格式。
标记写入图片格式自带的元数据机制,图片本身不受任何影响,任何看图软件都能正常打开。

## 特性

- 零第三方运行时依赖,仅用 Python 标准库
- PNG:写入 `tEXt` chunk
- JPEG:写入 `COM`(FFFE)注释段
- GIF:写入 `Comment Extension`(21 FE)
- 支持单个文件或批量处理

## 安装

```bash
pip install imgstamp_xw
```

## 命令行用法

```bash
# 给图片打上标记(默认原地修改,可用 -o 输出到新文件)
imgstamp_xw embed photo.png "hello world"

# 批量处理
imgstamp_xw embed a.png b.jpg c.gif "hello world"

# 提取标记
imgstamp_xw extract photo.png

# 校验标记是否存在且未被篡改
imgstamp_xw verify photo.png
```

## Python API

```python
from imgstamp_xw import embed_image, extract_stamp, verify

# 嵌入(原地修改)
embed_image("photo.png", "hello world")

# 嵌入并输出到新文件
embed_image("photo.png", "hello world", output="stamped.png")

# 提取
stamp = extract_stamp("stamped.png")   # -> "hello world"(无标记时为 None)

# 校验
ok = verify("stamped.png", "hello world")  # -> True
```

## 支持的格式

| 格式 | 魔数 | 写入位置 | 机制 |
| --- | --- | --- | --- |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `IHDR` 之后 | `tEXt` chunk |
| JPEG | `FF D8 FF` | `SOI` 之后 | `COM`(FFFE)注释段 |
| GIF | `47 49 46 38 37/39 61` | 逻辑屏幕描述符之后 | Comment Extension(21 FE) |

## 开发

```bash
pip install -e ".[dev]"
pytest
```

## 许可证

[MIT](LICENSE)
