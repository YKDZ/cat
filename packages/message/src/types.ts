import type { MessageCategory, MessageChannel } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

/** @zh 消息发送请求载荷。 @en Message send request payload. */
export type MessageRequest = {
  recipientId: string;
  category: MessageCategory;
  title: string;
  body: string;
  data?: JSONType;
  channels?: MessageChannel[];
};

/** @zh 渠道分发器接口。 @en Channel dispatcher interface. */
export interface ChannelDispatcher {
  readonly channel: MessageChannel;
  dispatch(request: MessageRequest): Promise<void>;
}
