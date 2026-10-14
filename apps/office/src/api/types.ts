import type { paths } from './schema';

type Json<T> = T extends { content: { 'application/json': infer Body } }
  ? Body
  : never;
type Ok<Path extends keyof paths> = paths[Path] extends {
  get: { responses: { 200: infer Response } };
}
  ? Json<Response>
  : never;
type Sent<Path extends keyof paths> = paths[Path] extends {
  post: { requestBody: { content: { 'application/json': infer Body } } };
}
  ? Body
  : never;

export type CurrentUser = Ok<'/auth/me'>;
export type Role = CurrentUser['role'];
export type User = Ok<'/users'>['items'][number];
export type RawMaterial = Ok<'/raw-materials/{id}'>;
export type RawMaterialType = RawMaterial['type'];
export type Product = Ok<'/products/{id}'>;
export type Mould = Ok<'/moulds/{id}'>;
export type Machine = Ok<'/machines/{id}'>;
export type EquipmentStatus = Mould['status'];
/** Customers and suppliers share one shape. */
export type Partner = Ok<'/customers/{id}'>;
export type FormulaVersion = Ok<'/formulas/{id}'>;
export type Location = Ok<'/locations/{id}'>;
export type LocationKind = Location['kind'];
export type StockDocumentSummary = Ok<'/stock/documents'>['items'][number];
export type StockDocument = Ok<'/stock/documents/{id}'>;
export type StockDocumentKind = StockDocument['kind'];
export type StockItemType = StockDocument['entries'][number]['itemType'];
export type Balance = Ok<'/stock/balances'>['items'][number];
export type StockCardLine = Ok<'/stock/card'>['items'][number];
export type LowStockLine = Ok<'/stock/low-stock'>[number];
export type Shortages = Ok<'/stock/receipts/shortages'>;
export type SalesOrder = Ok<'/sales-orders/{id}'>;
export type SalesOrderStatus = SalesOrder['status'];
export type OrderDelivery = Ok<'/sales-orders/{id}/delivery'>;
export type MaterialCheck = Ok<'/sales-orders/{id}/material-check'>;
export type MaterialShortages = Ok<'/sales-orders/material-shortages'>;
export type JobCard = Ok<'/job-cards/{id}'>;
export type JobCardStatus = JobCard['status'];
export type CardSummary = Ok<'/job-cards/{id}/summary'>;
export type IssueSuggestionLine =
  Ok<'/job-cards/{id}/issue-suggestion'>[number];
export type ProductionEntry = Ok<'/job-cards/{id}/entries'>[number];
export type Shift = ProductionEntry['shift'];
export type WasteEntry = Ok<'/job-cards/{id}/waste'>[number];
export type WasteType = WasteEntry['lines'][number]['wasteType'];
export type MachineOnBoard = Ok<'/production/machine-board'>[number];
export type Challan = Ok<'/dispatch/challans/{id}'>;
export type ChallanLine = Challan['lines'][number];
export type CustomerReturn = Challan['returns'][number];
export type ReturnReason = CustomerReturn['reason'];
export type ReturnSettlement = CustomerReturn['settlement'];
export type GatePassStatus = Challan['gatePassStatus'];
export type Company = Ok<'/settings/company'>;
export type GrindingReport = Ok<'/scrap/grinding'>;
export type GrindingBatch = GrindingReport['batches'][number];
export type ScrapSalesReport = Ok<'/scrap/sales'>;
export type ScrapSale = ScrapSalesReport['sales'][number];
export type WasteReportRow = Ok<'/production/waste-report'>[number];
export type WasteReportGroup = NonNullable<
  paths['/production/waste-report']['get']['parameters']['query']
>['groupBy'];
export type ScrapReason = Sent<'/scrap/transfers'>['reason'];
export type TodayFigures = Ok<'/dashboard/today'>;
export type OrderFigures = Ok<'/dashboard/orders'>;
export type StockFigures = Ok<'/dashboard/stock'>;
export type LeakFigures = Ok<'/dashboard/leaks'>;
export type WaitingChallan = Ok<'/dashboard/gate'>[number];
export type Operator = Ok<'/users/operators'>[number];

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
