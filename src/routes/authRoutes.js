import express from 'express';
import AuthController from '../controllers/AuthController.js';
import { asyncWrapper } from '../utils/helpers/index.js';

const router = express.Router();

const authController = new AuthController();

router
  .post('/login', asyncWrapper(authController.login.bind(authController)))
  .post(
    '/recover',
    asyncWrapper(authController.recoverPassword.bind(authController)),
  )
  .post(
    '/redefinir-senha',
    asyncWrapper(authController.updatePasswordByToken.bind(authController)),
  )
  .post(
    '/redefinir-senha-codigo',
    asyncWrapper(authController.updatePasswordByCode.bind(authController)),
  )
  .post('/logout', asyncWrapper(authController.logout.bind(authController)))
  .post('/revoke', asyncWrapper(authController.revoke.bind(authController)))
  .post('/refresh', asyncWrapper(authController.refresh.bind(authController)))
  .post('/introspect', asyncWrapper(authController.pass.bind(authController)));

export default router;
