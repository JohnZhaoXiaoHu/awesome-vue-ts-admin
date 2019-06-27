import bcrypt from 'bcryptjs';
import { adminUsers } from '@/utils/config';
import router, { asyncRouterMap, constantRouterMap } from '@/router';
import { routerItem } from '@/interface';
import { builder, baseData } from '@/utils/builder';
import models from '@/models';

interface UserData {
  username: string;
  userid: string;
  avatarUrl: string;
  email: string;
}

const Entity: any = models.user;

function filterAsyncRouter(AsyncRouterMap: routerItem[], permission: string[]): routerItem[] {
  const routerMap = AsyncRouterMap.filter((route) => {
    if (typeof route.permission === 'string') {
      return permission.indexOf(route.permission) > -1;
    }
    if (route.permission instanceof Array) {
      const filter = route.permission.filter(permissionKey => permission.indexOf(permissionKey) > -1);
      if (filter.length && route.children) {
        route.children = filterAsyncRouter(route.children, permission);
      }
      return filter.length;
    }
    return route.permission;
  });
  return routerMap;
}

/**
 * 过滤账户是否拥有某一个权限，并将菜单从加载列表移除
 *
 * @param permission
 * @param route
 * @returns {boolean}
 */
const hasPermission = (permission: string[]) => {
  // 过滤路由
  const filterRouter = filterAsyncRouter(asyncRouterMap, permission);
  // 添加路由的时候排除掉dashboard
  router.addRoutes(filterRouter);
  return filterRouter;
};

/**
 * 单账户多角色时，使用该方法可过滤角色不存在的菜单
 *
 * @param roles
 * @param route
 * @returns {*}
 */
// eslint-disable-next-line
function hasRole(roles, route) {
  if (route.meta && route.meta.roles) {
    return route.meta.roles.includes(roles.id);
  }
  return true;
}

const user = {
  state: {
    user: {
      username: '',
      userid: '',
      avatarUrl: '',
      email: '',
    },
    roles: [],
    permission_routers: [],
    permission_roles: [],
    spinning: true,
  },
  mutations: {
    SAVEROLES: (state: any, roles: Array<any>) => {
      state.roles = roles;
    },
    SAVEPERMISSIONROLES: (state: any, roles: Array<any>) => {
      state.permission_roles = roles;
    },
    SAVEUSER: (state: any, userData: UserData) => {
      state.user = user;
    },
    LOADING: (state: any, loading: boolean) => {
      state.spinning = loading;
    },
  },
  actions: {
    setDefaultUsers: async (context: any) => {
      await Entity.$fetch();
      adminUsers.map(async (user) => {
        const foundUsers = Entity.query()
          .where('username', user.username)
          .get();
        if (foundUsers.length === 0) {
          const hash = await bcrypt.hash(user.password, 10);
          const newUser = await Entity.$create({
            data: {
              name: user.username,
              username: user.username,
              password: user.password,
              hash,
              permissions: user.permissions,
            },
          });
          // fix:
          await Entity.generatePermissionDetails(newUser);
          console.log('Created new User:', newUser);
        } else {
          console.log('Found Existing User:', foundUsers);
        }
      });
    },
    registerByName: async (context: any, loginParams: any) => {
      await Entity.$fetch();
      const foundUsers = Entity.query()
        .where('username', loginParams.username)
        .get();
      if (foundUsers.length === 0) {
        const hash = await bcrypt.hash(loginParams.password, 10);
        const newUser = await Entity.$create({
          data: {
            name: loginParams.username,
            username: loginParams.username,
            password: loginParams.password,
            hash,
            permissions: ['1', '2', '3', '4', '5'],
          },
        });
        // fix:
        await Entity.generatePermissionDetails(newUser);
        if (newUser.length > 0) {
          const data = baseData('success', '注册成功，请登录');
          return Promise.resolve(builder(data, '注册成功，请登录'));
        }
        const error = baseData('fail', '注册失败');
        return Promise.reject(builder(error, '未知错误'));
      }
      const error = baseData('fail', '注册失败');
      return Promise.reject(builder(error, '用户名已存在'));
    },
    loginByName: async (context: any, loginParams: any) => {
      await Entity.$fetch();
      const user: any[] = Entity.query()
        .where('username', loginParams.username)
        .get();
      if (user.length > 0) {
        const validPassword = await bcrypt.compare(loginParams.password, user[0].hash);
        if (validPassword) {
          const now = new Date();
          now.setDate(now.getDate() + 1);
          window.localStorage.setItem(
            'token',
            JSON.stringify({
              id: user[0].id,
              deadline: now.getTime(),
            }),
          );
          const data = baseData('success', '登录成功');
          return Promise.resolve(builder(data, '登陆成功'));
        }
        const error = baseData('fail', '登录失败');
        return Promise.reject(builder(error, '密码错误'));
      }
      const error = baseData('fail', '登录失败');
      return Promise.reject(builder(error, '无此用户名'));
    },
    logout: (context: any, loginParams: any) => {
      // clear token
      window.localStorage.clear();
      const data = baseData('success', '登出成功');
      return Promise.resolve(builder(data, '登出，结束会话'));
    },
    getUserLocalInfo: async (context: any) => {
      // for localforage Model.$fetch
      if (Entity.$fetch) Entity.$fetch();
      const token = JSON.parse(window.localStorage.getItem('token'));
      console.log('token:', token);
      const entity = Entity.find(token.id);
      // for graghql entity.fetch
      if (entity.fetch) entity.fetch();

      console.log('User Entity:', entity);
      return new Promise((resolve, reject) => {
        if (entity) {
          const userData: UserData = {
            username: entity.username,
            userid: entity.id,
            avatarUrl: entity.avatarUrl,
            email: entity.email,
          };
          // SAVE USER
          context.commit('SAVEUSER', userData);
          // SAVE PERMISSION to entities.user.state.permissionList
          Entity.generatePermissionDetails({ user: [entity] });
          // SAVE PERMISSION to user.permission_roles
          context.commit('SAVEROLES', entity.permissions);
          // GET ROUTERS
          const getRouter = hasPermission(entity.permissions);
          context.dispatch('GetMenuData', getRouter);
          resolve(entity);
        } else {
          reject('获取用户信息失败');
        }
      });
    },
  },
  getters: {
    currentUser: async (state: any) => {
      const { id } = JSON.parse(window.localStorage.getItem('token'));
      const entity = await Entity.$get(id);
      return entity;
    },
  },
};

export default user;
