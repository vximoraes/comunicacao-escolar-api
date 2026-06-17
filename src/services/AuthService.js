import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  CustomError,
  HttpStatusCodes,
  messages,
} from '../utils/helpers/index.js';
import tokenUtil from '../utils/TokenUtil.js';
import AuthHelper from '../utils/AuthHelper.js';

import UserRepository from '../repositories/UserRepository.js';
import EmailService from './EmailService.js';

class AuthService {
  constructor({ tokenUtil: injectedTokenUtil } = {}) {
    // Se nada for injetado, usa a instância importada
    this.TokenUtil = injectedTokenUtil || tokenUtil;
    this.repository = new UserRepository();
  }

  async loadTokens(id, token) {
    const data = await this.repository.getById(id, { includeTokens: true });
    return { data };
  }

  async revoke(id) {
    if (!id) {
      throw new CustomError({
        statusCode: HttpStatusCodes.BAD_REQUEST.code,
        errorType: 'validationError',
        field: 'id',
        details: [],
        customMessage: 'ID do usuário é obrigatório para revogar tokens.',
      });
    }

    // Verificar se o usuário existe
    const usuario = await this.repository.getById(id);
    if (!usuario) {
      throw new CustomError({
        statusCode: HttpStatusCodes.NOT_FOUND.code,
        errorType: 'notFound',
        field: 'Usuário',
        details: [],
        customMessage: 'Usuário não encontrado para revogação de tokens.',
      });
    }

    const data = await this.repository.deleteToken(id);
    if (!data) {
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        errorType: 'serverError',
        field: 'Token',
        details: [],
        customMessage: 'Erro ao revogar tokens do usuário.',
      });
    }

    return { message: 'Tokens revogados com sucesso.' };
  }

  async logout(id) {
    const data = await this.repository.deleteToken(id);
    return { data };
  }

  async login(body) {
    // Buscar o usuário pelo email
    const userEncontrado = await this.repository.getByEmail(body.email);
    if (!userEncontrado) {
      throw new CustomError({
        statusCode: 401,
        errorType: 'notFound',
        field: 'Email',
        details: [],
        customMessage: messages.error.unauthorized('Senha ou Email'),
      });
    }

    // Validar a senha
    const senhaValida = await bcrypt.compare(
      body.password,
      userEncontrado.password,
    );
    if (!senhaValida) {
      throw new CustomError({
        statusCode: 401,
        errorType: 'unauthorized',
        field: 'Senha',
        details: [],
        customMessage: messages.error.unauthorized('Senha ou Email'),
      });
    }

    const memberships = Array.isArray(userEncontrado.memberships)
      ? userEncontrado.memberships
      : [];
    const hasNonStudentRole = memberships.some(
      (membership) => membership?.role && membership.role !== 'student',
    );

    if (!hasNonStudentRole) {
      throw new CustomError({
        statusCode: 401,
        errorType: 'unauthorized',
        field: 'Role',
        details: [],
        customMessage: 'Este perfil não possui acesso ao aplicativo.',
      });
    }

    // Gerar novo access token utilizando a instância injetada
    const access_token = await this.TokenUtil.generateAccessToken(
      userEncontrado._id,
    );

    // Buscar o usuário com os tokens já armazenados
    const userComTokens = await this.repository.getById(
      userEncontrado._id,
      true,
    );
    let refresh_token = userComTokens.refresh_token;

    if (refresh_token) {
      try {
        jwt.verify(refresh_token, process.env.JWT_SECRET_REFRESH_TOKEN);
      } catch (error) {
        if (
          error.name === 'TokenExpiredError' ||
          error.name === 'JsonWebTokenError'
        ) {
          refresh_token = await this.TokenUtil.generateRefreshToken(
            userEncontrado._id,
          );
        } else {
          throw new CustomError({
            statusCode: 500,
            errorType: 'serverError',
            field: 'Token',
            details: [],
            customMessage: messages.error.unauthorized(
              'falha na geração do token',
            ),
          });
        }
      }
    } else {
      // Se o refresh token não existe, gera um novo
      refresh_token = await this.TokenUtil.generateRefreshToken(
        userEncontrado._id,
      );
    }

    // Armazenar os tokens atualizados
    await this.repository.storeTokens(
      userEncontrado._id,
      access_token,
      refresh_token,
    );

    // Buscar novamente o usuário e remover a senha
    const userLogado = await this.repository.getByEmail(body.email);
    delete userLogado.password;
    const userObjeto = userLogado.toObject();

    // Retornar o usuário com os tokens
    return { user: { access_token, refresh_token, ...userObjeto } };
  }

  // RecuperaSenhaService.js
  async recoverPassword(body) {
    console.log('Dados recebidos para recuperação de senha:', body);
    // ───────────────────────────────────────────────
    // Passo 1 – Buscar usuário pelo e-mail informado
    // ───────────────────────────────────────────────
    console.log('E-mail recebido no body:', body.email);

    const userEncontrado = await this.repository.getByEmail(body.email);

    console.log('Usuário encontrado:', userEncontrado);

    // Se não encontrar, lança erro 404
    if (!userEncontrado) {
      throw new CustomError({
        statusCode: HttpStatusCodes.NOT_FOUND.code,
        field: 'Email',
        details: [],
        customMessage: HttpStatusCodes.NOT_FOUND.message,
      });
    }

    // ───────────────────────────────────────────────
    // Passo 2 – Gerar código de verificação (6 carac.)
    // ───────────────────────────────────────────────
    const generateCode = () =>
      Math.random()
        .toString(36) // ex: "0.f5g9hk3j"
        .replace(/[^a-z0-9]/gi, '') // mantém só letras/números
        .slice(0, 6) // pega os 6 primeiros (aumentado para reduzir colisões)
        .toUpperCase(); // converte p/ maiúsculas

    let codigoRecuperaSenha = generateCode();

    // ───────────────────────────────────────────────
    // Passo 3 – Garantir unicidade do código gerado (com limite de tentativas)
    // ───────────────────────────────────────────────
    let tentativas = 0;
    const MAX_TENTATIVAS = 10;
    let codigoExistente =
      await this.repository.getByRecoveryCode(codigoRecuperaSenha);

    while (codigoExistente && tentativas < MAX_TENTATIVAS) {
      tentativas++;
      console.log(
        `Código já existe, gerando um novo código (tentativa ${tentativas}/${MAX_TENTATIVAS})`,
      );
      codigoRecuperaSenha = generateCode();
      codigoExistente =
        await this.repository.getByRecoveryCode(codigoRecuperaSenha);
    }

    // Se após 10 tentativas ainda não conseguiu, usa timestamp + random
    if (codigoExistente) {
      console.warn(
        'Não foi possível gerar código único após 10 tentativas, usando timestamp',
      );
      codigoRecuperaSenha = Date.now().toString(36).slice(-6).toUpperCase();
    }

    console.log('Código gerado:', codigoRecuperaSenha);

    // ───────────────────────────────────────────────
    // Passo 4 – Gerar token único (JWT) p/ recuperação
    // ───────────────────────────────────────────────
    console.log('Gerando token único para recuperação de senha');
    const tokenUnico = await this.TokenUtil.generatePasswordRecoveryToken(
      userEncontrado._id,
    );

    // ───────────────────────────────────────────────
    // Passo 5 – Persistir token + código no usuário
    // ───────────────────────────────────────────────
    const expMs = Date.now() + 15 * 60 * 1000; // 15 minutos de expiração
    const data = await this.repository.update(userEncontrado._id, {
      unique_token: tokenUnico,
      password_recovery_code: codigoRecuperaSenha,
      password_recovery_code_exp: new Date(expMs).toISOString(),
    });

    if (!data) {
      // Falha ao atualizar → erro 500
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        field: 'Recuperação de Senha',
        details: [],
        customMessage: HttpStatusCodes.INTERNAL_SERVER_ERROR.message,
      });
    }

    // ───────────────────────────────────────────────
    // Passo 6 – Enviar e-mail de recuperação de senha
    // ───────────────────────────────────────────────
    try {
      await EmailService.enviarEmailRecuperacaoSenha(
        userEncontrado.full_name,
        userEncontrado.email,
        tokenUnico,
      );
      console.log(
        'E-mail de recuperação enviado com sucesso para:',
        userEncontrado.email,
      );
    } catch (error) {
      console.error('Erro ao enviar e-mail de recuperação:', error);
      // Se falhar ao enviar o e-mail, reverte a atualização do usuário
      await this.repository.update(userEncontrado._id, {
        unique_token: null,
        password_recovery_code: null,
        password_recovery_code_exp: null,
      });
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        field: 'E-mail',
        details: [],
        customMessage:
          'Erro ao enviar e-mail de recuperação de senha. Tente novamente mais tarde.',
      });
    }

    // ───────────────────────────────────────────────
    // Passo 7 – Retornar resposta ao cliente
    // ───────────────────────────────────────────────
    return {
      message:
        'E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.',
      email: userEncontrado.email,
    };
  }

  /**
   * Atualiza a senha do próprio usuário em dois cenários NÃO autenticados:
   *
   * 1) Normal (token único passado na URL como query: `?token=<JWT_PASSWORD_RECOVERY>`)
   *    + { senha } no body.
   *    → Decodifica JWT, extrai usuarioId, salva o hash da nova senha mesmo que usuário esteja inativo.
   *
   * 2) Recuperação por código (envia `{ codigo_recupera_senha, senha }` no body).
   *    → Busca usuário pelo campo `codigo_recupera_senha`, salva hash da nova senha (mesmo se inativo),
   *      e “zera” o campo `codigo_recupera_senha`.
   */
  async updatePasswordByToken(tokenRecuperacao, senhaBody) {
    // 1) Decodifica o token para obter o ID do usuário
    const usuarioId = await this.TokenUtil.decodePasswordRecoveryToken(
      tokenRecuperacao,
      process.env.JWT_SECRET_PASSWORD_RECOVERY,
    );

    // 2) Gera o hash da senha pura
    const senhaHasheada = await AuthHelper.hashPassword(senhaBody.password);
    console.log('Senha hasheada:', senhaHasheada);

    // Buscar usuário pelo token unico
    const usuario = await this.repository.getByUniqueToken(tokenRecuperacao);
    if (!usuario) {
      throw new CustomError({
        statusCode: HttpStatusCodes.NOT_FOUND.code,
        field: 'Token',
        details: [],
        customMessage: 'Token de recuperação já foi utilizado ou é inválido.',
      });
    }

    // 3) Atualiza no repositório (já com hash)
    const usuarioAtualizado = await this.repository.updatePassword(
      usuarioId,
      senhaHasheada,
    );
    if (!usuarioAtualizado) {
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        field: 'Senha',
        details: [],
        customMessage: 'Erro ao atualizar a senha.',
      });
    }

    return { message: 'Senha atualizada com sucesso.' };
  }

  /**
   * Atualiza senha via código de recuperação
   */
  async updatePasswordByCode(codigoRecuperaSenha, senhaBody) {
    // 1) Busca usuário pelo código de recuperação
    const user = await this.repository.getByRecoveryCode(codigoRecuperaSenha);
    if (!user) {
      throw new CustomError({
        statusCode: HttpStatusCodes.NOT_FOUND.code,
        field: 'Código de Recuperação',
        details: [],
        customMessage: 'Código de recuperação inválido ou não encontrado.',
      });
    }

    // 2) Verifica expiração
    if (user.password_recovery_code_exp < new Date()) {
      throw new CustomError({
        statusCode: HttpStatusCodes.UNAUTHORIZED.code,
        field: 'Código de Recuperação',
        details: [],
        customMessage: 'Código de recuperação expirado.',
      });
    }

    // 3) Hash da nova senha
    const senhaHasheada = await AuthHelper.hashPassword(senhaBody.password);

    // 4) Atualiza no repositório
    const atualizado = await this.repository.updatePassword(
      user._id,
      senhaHasheada,
    );
    if (!atualizado) {
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        field: 'Senha',
        details: [],
        customMessage: 'Erro ao atualizar a senha.',
      });
    }

    return { message: 'Senha atualizada com sucesso.' };
  }

  async refresh(id, token) {
    const userEncontrado = await this.repository.getById(id, {
      includeTokens: true,
    });

    if (!userEncontrado) {
      throw new CustomError({
        statusCode: HttpStatusCodes.NOT_FOUND.code,
        field: 'Token',
        details: [],
        customMessage: HttpStatusCodes.NOT_FOUND.message,
      });
    }

    if (userEncontrado.refresh_token !== token) {
      console.log('Token inválido');
      throw new CustomError({
        statusCode: HttpStatusCodes.UNAUTHORIZED.code,
        errorType: 'invalidToken',
        field: 'Token',
        details: [],
        customMessage: messages.error.unauthorized('Token'),
      });
    }

    // Gerar novo access token utilizando a instância injetada
    const access_token = await this.TokenUtil.generateAccessToken(id);

    /**
     * Se SINGLE_SESSION_REFRESH_TOKEN for true, gera um novo refresh token
     * Senão, mantém o token armazenado
     */
    let refresh_token = '';
    if (process.env.SINGLE_SESSION_REFRESH_TOKEN === 'true') {
      refresh_token = await this.TokenUtil.generateRefreshToken(id);
    } else {
      refresh_token = userEncontrado.refresh_token;
    }

    // Atualiza o usuário com os novos tokens
    await this.repository.storeTokens(id, access_token, refresh_token);

    // monta o objeto de usuário com os tokens para resposta
    const userLogado = await this.repository.getById(id, {
      includeTokens: true,
    });
    delete userLogado.password;
    const userObjeto = userLogado.toObject();

    const userComTokens = {
      access_token,
      refresh_token,
      ...userObjeto,
    };

    return { user: userComTokens };
  }
}

export default AuthService;
