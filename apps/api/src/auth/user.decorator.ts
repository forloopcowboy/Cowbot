import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionRequest } from 'supertokens-node/framework/express';

/** Pull the SuperTokens user id off the current request. Use with @UseGuards(SessionGuard). */
export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const userId = req.session?.getUserId();
    if (!userId) throw new UnauthorizedException();
    return userId;
  },
);
