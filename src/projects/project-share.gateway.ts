import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ConfigService } from "@nestjs/config";
import { Logger, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { Server, Socket } from "socket.io";
import { ProjectModel } from "./models/project.model";

type ProjectShareSocket = Socket & {
  data: {
    shareToken?: string;
  };
};

@WebSocketGateway({
  namespace: "/project-share",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ProjectShareGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(ProjectShareGateway.name);

  constructor(private readonly configService: ConfigService) {}

  async handleConnection(client: ProjectShareSocket) {
    try {
      const apiKey = this.getHandshakeValue(client, "apiKey");
      this.assertApiKey(apiKey);

      const shareToken = this.getHandshakeValue(client, "shareToken");
      if (!shareToken) {
        throw new UnauthorizedException("Thiếu share token");
      }

      const projectExists = await ProjectModel.exists({ shareToken });
      if (!projectExists) {
        throw new UnauthorizedException("Share token không hợp lệ");
      }

      client.data.shareToken = shareToken;
      await client.join(this.getShareRoom(shareToken));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Xác thực socket thất bại";
      this.logger.warn(`Project share socket rejected: ${message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: ProjectShareSocket) {
    if (!client.data.shareToken) {
      return;
    }

    void client.leave(this.getShareRoom(client.data.shareToken));
  }

  emitSharedProjectUpdated(
    shareToken: string,
    payload: {
      project: Record<string, unknown>;
    },
  ) {
    this.server
      .to(this.getShareRoom(shareToken))
      .emit("project.share.updated", payload);
  }

  private getShareRoom(shareToken: string) {
    return `share:${shareToken}`;
  }

  private getHandshakeValue(client: ProjectShareSocket, key: string) {
    const authValue = client.handshake.auth?.[key];
    if (typeof authValue === "string" && authValue.trim()) {
      return authValue.trim();
    }

    const queryValue = client.handshake.query?.[key];
    if (typeof queryValue === "string" && queryValue.trim()) {
      return queryValue.trim();
    }

    const headerValue = client.handshake.headers[key.toLowerCase()];
    if (typeof headerValue === "string" && headerValue.trim()) {
      return headerValue.trim();
    }

    return null;
  }

  private assertApiKey(apiKey: string | null) {
    if (!apiKey) {
      throw new UnauthorizedException("Thiếu API key");
    }

    const expectedKey = this.configService.get<string>("API_KEY");
    if (!expectedKey) {
      throw new UnauthorizedException("API key chưa được cấu hình");
    }

    const isValid =
      apiKey.length === expectedKey.length &&
      timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey));

    if (!isValid) {
      throw new UnauthorizedException("API key không hợp lệ");
    }
  }
}
