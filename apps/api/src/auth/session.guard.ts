import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { verifySession } from 'supertokens-node/recipe/session/framework/express';
import { SessionRequest } from 'supertokens-node/framework/express';

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SessionRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    let authenticated = false;
    await new Promise<void>((resolve, reject) => {
      verifySession()(req as Request, res, (err) => {
        if (err) reject(err);
        else {
          authenticated = req.session !== undefined;
          resolve();
        }
      });
    }).catch(() => {
      // verifySession sends 401 itself; nothing more to do
    });

    if (!authenticated) throw new UnauthorizedException();
    return true;
  }
}

/** Convenience: lift the SuperTokens user id off the request. */
export function userIdFromReq(req: SessionRequest): string {
  const userId = req.session?.getUserId();
  if (!userId) throw new UnauthorizedException();
  return userId;
}
