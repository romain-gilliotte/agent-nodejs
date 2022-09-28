import { Factory } from 'fishery';
import PermissionService from '../../src/services/permissions';

export class PermissionsFactory extends Factory<PermissionService> {
  mockAllMethods() {
    return this.afterBuild(permissions => {
      permissions.invalidateCache = jest.fn();
      permissions.can = jest.fn().mockResolvedValue(undefined);
    });
  }
}

export default PermissionsFactory.define(
  () =>
    new PermissionService({
      isProduction: true,
      envSecret: '123',
      forestServerUrl: 'http://api',
      permissionsCacheDurationInSeconds: 15 * 60,
    }),
);
