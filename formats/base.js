// 共享基础:错误类型与标记关键字。

/** 不支持的图片格式或无法解析的数据。 */
export class UnsupportedFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

/** tEXt keyword / GIF 注释前缀,用于区分本库写入的标记。 */
export const KEYWORD = "imgstamp_xw";
