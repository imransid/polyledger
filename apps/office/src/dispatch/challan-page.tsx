import { Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Challan, Company, CustomerReturn } from '@/api/types';
import { DISPATCH_MANAGERS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { DataTable } from '@/components/data-table';
import { DocumentLink } from '@/components/document-link';
import { ReasonButton } from '@/components/reason-button';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import {
  formatCartons,
  formatDay,
  formatMoment,
  formatPhone,
  formatPieces,
} from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { useCompany } from '@/settings/use-company';
import { ChallanPrint } from './challan-print';
import { ChallanStatusBadge } from './parts';
import { totalPieces, useChallan } from './use-dispatch';

const words = text.dispatch;

export function ChallanPage() {
  const { id = '' } = useParams();
  const challan = useChallan(id);
  const company = useCompany();
  if (!challan.data || !company.data) {
    return <RecordPending error={challan.error ?? company.error} />;
  }
  return (
    <>
      <div className="print:hidden">
        <ChallanView challan={challan.data} company={company.data} />
      </div>
      <ChallanPrint challan={challan.data} company={company.data} />
    </>
  );
}

function ChallanView({
  challan,
  company,
}: {
  challan: Challan;
  company: Company;
}) {
  const canManage = DISPATCH_MANAGERS.includes(useUser().role);
  const passed = challan.gatePassStatus === 'PASSED';
  const returnable =
    passed && challan.lines.some((line) => line.pieces > line.returnedPieces);
  return (
    <RecordShell
      title={challan.number}
      badge={<ChallanStatusBadge challan={challan} />}
      actions={
        <>
          {canManage && returnable && (
            <Button variant="outline" size="sm" asChild>
              <Link to="return">{words.recordReturn}</Link>
            </Button>
          )}
          {canManage && !passed && !challan.reversedAt && (
            <ReverseChallan challan={challan} />
          )}
          <Button size="sm" onClick={() => window.print()}>
            <Printer />
            {words.print}
          </Button>
        </>
      }
    >
      {company.name === '' && (
        <Alert>
          <AlertDescription>{words.noCompany}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{words.date}</dt>
        <dd>{formatDay(challan.dispatchedOn)}</dd>
        <dt className="text-muted-foreground">{words.customer}</dt>
        <dd>
          {challan.customerCode} · {challan.customerName}
        </dd>
        <dt className="text-muted-foreground">{words.order}</dt>
        <dd>
          <Link
            to={`/orders/${challan.orderId}`}
            className="underline-offset-4 hover:underline"
          >
            {challan.orderNumber}
          </Link>
          {challan.customerPo && ` · ${challan.customerPo}`}
        </dd>
        <dt className="text-muted-foreground">{words.vehicle}</dt>
        <dd>{challan.vehicleNumber}</dd>
        <dt className="text-muted-foreground">{words.driver}</dt>
        <dd>
          {challan.driverName} · {formatPhone(challan.driverPhone)}
        </dd>
        <dt className="text-muted-foreground">{words.address}</dt>
        <dd>{challan.deliveryAddress}</dd>
        {challan.notes && (
          <>
            <dt className="text-muted-foreground">{words.notes}</dt>
            <dd>{challan.notes}</dd>
          </>
        )}
        {challan.gatePassedAt && (
          <>
            <dt className="text-muted-foreground">{words.passedAt}</dt>
            <dd>{formatMoment(challan.gatePassedAt)}</dd>
          </>
        )}
      </dl>
      <DataTable<Challan['lines'][number]>
        rows={challan.lines}
        rowKey={(line) => line.productId}
        columns={[
          { header: text.masterData.code, cell: (line) => line.code },
          { header: words.product, cell: (line) => line.name },
          {
            header: words.pieces,
            numeric: true,
            cell: (line) => formatPieces(line.pieces),
          },
          {
            header: words.cartons,
            numeric: true,
            cell: (line) => formatCartons(line.pieces, line.piecesPerCarton),
          },
          {
            header: words.returned,
            numeric: true,
            cell: (line) =>
              line.returnedPieces > 0 ? formatPieces(line.returnedPieces) : '',
          },
        ]}
      />
      <p className="text-right text-sm font-medium">
        {words.total} {formatPieces(totalPieces(challan.lines))}
      </p>
      <Returns challan={challan} canManage={canManage} />
    </RecordShell>
  );
}

function ReverseChallan({ challan }: { challan: Challan }) {
  const write = useWrite('dispatch', 'sales-orders', 'stock');
  return (
    <ReasonButton
      label={words.reverse}
      question={words.confirmReverse(challan.number)}
      reasonLabel={words.reverseReason}
      onConfirm={async (reason) => {
        await unwrap(
          api.POST('/dispatch/challans/{id}/reverse', {
            params: { path: { id: challan.id } },
            body: { reason },
            headers: write.headers,
          }),
        );
        await write.done();
      }}
    />
  );
}

function Returns({
  challan,
  canManage,
}: {
  challan: Challan;
  canManage: boolean;
}) {
  if (challan.returns.length === 0) {
    return null;
  }
  const code = (productId: string) =>
    challan.lines.find((line) => line.productId === productId)?.code ?? '';
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.returns}</h2>
      <DataTable<CustomerReturn>
        rows={challan.returns}
        rowKey={(customerReturn) => customerReturn.id}
        columns={[
          {
            header: words.returnNumber,
            cell: (customerReturn) => (
              <DocumentLink
                id={customerReturn.stockDocumentId}
                number={customerReturn.number}
              />
            ),
          },
          {
            header: words.date,
            cell: (customerReturn) => formatDay(customerReturn.returnedOn),
          },
          {
            header: words.pieces,
            cell: (customerReturn) =>
              customerReturn.lines
                .map(
                  (line) =>
                    `${code(line.productId)} ${formatPieces(line.pieces)}`,
                )
                .join(', '),
          },
          {
            header: words.reason,
            cell: (customerReturn) => words.reasons[customerReturn.reason],
          },
          {
            header: words.settlement,
            cell: (customerReturn) =>
              words.settlements[customerReturn.settlement],
          },
          {
            header: text.masterData.status,
            cell: (customerReturn) =>
              customerReturn.reversedAt
                ? words.reversed
                : canManage && (
                    <ReverseReturn customerReturn={customerReturn} />
                  ),
          },
        ]}
      />
    </section>
  );
}

function ReverseReturn({ customerReturn }: { customerReturn: CustomerReturn }) {
  const write = useWrite('dispatch', 'sales-orders', 'stock');
  return (
    <ReasonButton
      label={words.reverse}
      question={words.confirmReverseReturn(customerReturn.number)}
      reasonLabel={words.reverseReason}
      onConfirm={async (reason) => {
        await unwrap(
          api.POST('/dispatch/returns/{id}/reverse', {
            params: { path: { id: customerReturn.id } },
            body: { reason },
            headers: write.headers,
          }),
        );
        await write.done();
      }}
    />
  );
}
