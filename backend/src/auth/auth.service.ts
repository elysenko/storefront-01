import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { toApiRole, type AuthUser } from '../common/api-role';
import type { JwtPayload } from './jwt.strategy';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 10;

export interface AuthSession {
  token: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Signup always mints a shopper (Role.USER). The role is never client
   * settable and there is no first-signup-becomes-admin promotion — admin
   * logins are platform-owned and materialized by the seed.
   */
  async signup(dto: SignupDto): Promise<AuthSession> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { email, passwordHash, role: Role.USER },
      });
      return this.issue(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with that email address already exists.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same message for "no such user" and "wrong password" — never leak which.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email address or password is incorrect.');
    }
    return this.issue(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Your session is no longer valid.');
    }
    return this.toAuthUser(user);
  }

  private issue(user: User): AuthSession {
    const authUser = this.toAuthUser(user);
    const payload: JwtPayload = { sub: authUser.id, email: authUser.email, role: authUser.role };
    return { token: this.jwt.sign(payload), user: authUser };
  }

  private toAuthUser(user: User): AuthUser {
    return { id: user.id, email: user.email, role: toApiRole(user.role) };
  }
}
