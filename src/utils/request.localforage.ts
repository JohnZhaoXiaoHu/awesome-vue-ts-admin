import models from '@/models';
import { builder, baseData } from '@/utils/builder';
import { AGenTableColumns, VGenTableHeaders } from '@/utils/genFormData';


export interface BaseData {
  result: {
    resultCode: number;
    resultMessage: any;
  };
  entity: any;
}
export interface LfBasicCredentials {
  username: string
  password: string
}

export interface LfRequestConfig {
  url?: string
  method?: string
  params?: any
  data?: any
  fetchType?: string
  baseURL?: string
  headers?: any
  paramsSerializer?: (params: any) => string
  timeout?: number
  withCredentials?: boolean
  auth?: LfBasicCredentials
  responseType?: string
  xsrfCookieName?: string
  xsrfHeaderName?: string
  onUploadProgress?: (progressEvent: any) => void
  onDownloadProgress?: (progressEvent: any) => void
  maxContentLength?: number
  validateStatus?: (status: number) => boolean
  maxRedirects?: number
  httpAgent?: any
  httpsAgent?: any
}

export interface LfResponse<T = any> {
  data: T
  status?: number
  statusText?: string
  headers?: any
  config?: LfRequestConfig
  request?: any
  success?: boolean
  message?: string
  code?: number
  statusCode?: number
  timestamp?: number
}

export interface LfService {
  validateUrl: (options: LfRequestConfig) => LfRequestConfig

  request(params: any): Promise<LfResponse>

  post?(model: any, data: any): Promise<LfResponse>

  remove?(model: any, data: any): Promise<LfResponse>

  patch?(model: any, data: any): Promise<LfResponse>

  handleRequest: (options: LfRequestConfig) => Promise<LfResponse>

  response(params: any): Promise<LfResponse>

}

const genPagination = (model, pagination) => {
  const total = model.query().count();
  const pageNum = (pagination.pageNum && parseInt(pagination.pageNum)) || 1;
  const pageSize = (pagination.pageSize && parseInt(pagination.pageSize)) || 10;
  const totalPage = Math.ceil(total / pageSize) || 0;
  // offset and next
  const offset = (pageNum - 1) * pageSize || 0;
  const next = (pageNum >= totalPage ? total % pageSize : pageSize) + 1;
  return {
    total,
    pageNum,
    pageSize,
    totalPage,
    offset,
    next,
  };
};

// 创建 axios localforage 实例
const lfService: LfService = {
  validateUrl: (options: LfRequestConfig) => {
    const [prefix, namespace, action] = options.url.split('/');
    const model: any = models[namespace];
    // header, columns
    const columns = AGenTableColumns(model.fieldsKeys());
    const headers = VGenTableHeaders(model.fieldsKeys());
    const newOptions: LfRequestConfig = {
      ...options,
      params: {
        ...options.params,
        model,
        prefix,
        namespace,
        action,
        columns,
        headers,
      },
    };
    return newOptions;
  },
  async response(params) {
    const result = await this.request(params);
    return result;
  },
  /**
   * 从请求参数中获取model等，包装返回类axios的内容
   * @param {any} params 请求参数
   */
  async request(params: LfRequestConfig) {
    const newParams = this.validateUrl(params);
    console.log('New params', newParams);
    const result = await this.handleRequest(newParams);
    return result;
  },
  handleRequest: async (options: LfRequestConfig) => new Promise(async (resolve, reject) => {
    const {
      method,
      data,
      params: { model, namespace, pagination },
    } = options;

    const Entity = model;

    let requestedData: BaseData = null;
    const requestedConfig: LfRequestConfig = {
      ...options,
    };

    switch (method) {
      case 'post':
        const createdItems = await Entity.$create({ data });
        requestedData = baseData('success', '创建成功');
        requestedData.entity = createdItems;
        break;
      case 'delete':
        const deletedItems = await Entity.$delete(data.id || data);
        requestedData = baseData('success', '删除成功');
        requestedData.entity = deletedItems;
        break;
      case 'patch':
        const patchedItems = await Entity.$update({ data });
        requestedData = baseData('success', '更新成功');
        requestedData.entity = patchedItems;
        break;
      case 'get':
        if (!data) {
          await Entity.$fetch();
          // query with pagination, header, columns
          // pagination
          const paginationConfig = genPagination(Entity, pagination);
          const entity = Entity
            .query()
            .offset(paginationConfig.offset)
            .limit(paginationConfig.pageSize)
            .get();
          requestedData = baseData('success', '查询成功');
          requestedData.entity = entity;
          requestedConfig.params.pagination = paginationConfig;
        } else {
          await Entity.$fetch();
          const entities = await Entity.$get(data.id.toString());
          requestedData = baseData('success', '查询成功');
          requestedData.entity = entities[namespace][0];
        }
    }
    console.log(`${method} Localforage vuex -> `, requestedData);
    const response = builder(
      requestedData,
      `${method} ${namespace} Ok`,
      200,
      requestedConfig,
      {},
    );
    resolve(response);
  }),
};

export default lfService;
