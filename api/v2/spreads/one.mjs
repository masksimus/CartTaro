import { handleV2 } from '../../../server/src/api-v2-handler.mjs';

export default async function handler(req, res) {
  return handleV2(req, res, 'spreadOne');
}
