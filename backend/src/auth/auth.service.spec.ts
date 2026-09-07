import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';

const duplicateEmail = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('AuthService', () => {
  let prisma: { user: { create: jest.Mock; findUnique: jest.Mock } };
  let jwt: { sign: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = { user: { create: jest.fn(), findUnique: jest.fn() } };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    );
  });

  describe('signup', () => {
    it('always mints a shopper, never an admin, whatever the client sends', async () => {
      prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'u1', ...data }),
      );

      const session = await service.signup({
        email: 'New.Shopper@Example.Test',
        password: 'correct horse battery',
        // A client trying to escalate: the DTO whitelists it away, and the
        // service hardcodes the role regardless.
        role: 'ADMIN',
      } as never);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.role).toBe(Role.USER);
      expect(data.email).toBe('new.shopper@example.test');
      expect(data.passwordHash).not.toBe('correct horse battery');
      expect(session.user.role).toBe('shopper');
      expect(session.token).toBe('signed.jwt.token');
    });

    it('rejects a duplicate email with 409, not a 500', async () => {
      prisma.user.create.mockRejectedValue(duplicateEmail());

      await expect(
        service.signup({ email: 'taken@example.test', password: 'whatever-1' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('issues a token carrying sub/email/role for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u9',
        email: 'shopper@example.test',
        passwordHash: await bcrypt.hash('s3cret-password', 4),
        role: Role.USER,
      });

      const session = await service.login({
        email: ' Shopper@Example.Test ',
        password: 's3cret-password',
      } as never);

      expect(session.user).toEqual({
        id: 'u9',
        email: 'shopper@example.test',
        role: 'shopper',
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u9',
        email: 'shopper@example.test',
        role: 'shopper',
      });
    });

    it('maps an ADMIN row to the api role admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'a1',
        email: 'ops@example.test',
        passwordHash: await bcrypt.hash('another-password', 4),
        role: Role.ADMIN,
      });

      const session = await service.login({
        email: 'ops@example.test',
        password: 'another-password',
      } as never);

      expect(session.user.role).toBe('admin');
    });

    it('gives the same 401 message for an unknown email and a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const unknown = await service
        .login({ email: 'nobody@example.test', password: 'whatever-1' } as never)
        .catch((error: UnauthorizedException) => error);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u9',
        email: 'shopper@example.test',
        passwordHash: await bcrypt.hash('the-real-password', 4),
        role: Role.USER,
      });
      const wrongPassword = await service
        .login({ email: 'shopper@example.test', password: 'not-the-password' } as never)
        .catch((error: UnauthorizedException) => error);

      expect(unknown).toBeInstanceOf(UnauthorizedException);
      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      expect((unknown as UnauthorizedException).message).toBe(
        (wrongPassword as UnauthorizedException).message,
      );
    });
  });

  it('me() rejects a token whose user row has since disappeared', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.me('ghost')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
