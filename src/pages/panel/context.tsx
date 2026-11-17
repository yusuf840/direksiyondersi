import { createContext, useContext } from 'react'
import type { Business, Resource, Service, ServiceResource } from '../../lib/types'

export interface PanelCtx {
  biz: Business
  role: 'owner' | 'staff'
  myResourceId: string | null
  resources: Resource[]
  services: Service[]
  links: ServiceResource[]
  reload: () => Promise<void>
}
export const PanelContext = createContext<PanelCtx>(null as unknown as PanelCtx)
export const usePanel = () => useContext(PanelContext)
