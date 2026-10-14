import type { Challan, Company } from '@/api/types';
import { text } from '@/i18n';
import {
  formatCartons,
  formatDay,
  formatPhone,
  formatPieces,
} from '@/lib/format';
import { totalPieces } from './use-dispatch';

const words = text.dispatch.printout;

// One Print click prints each of these on its own page.
const COPIES = [words.copies.customer, words.copies.office, words.copies.gate];

interface PrintProps {
  challan: Challan;
  company: Company;
}

/** Shown only on paper. */
export function ChallanPrint({ challan, company }: PrintProps) {
  return (
    <div className="hidden text-black print:block">
      {COPIES.map((copy) => (
        <section
          key={copy}
          aria-label={copy}
          className="grid gap-5 text-sm break-after-page last:break-after-auto"
        >
          <p className="text-right text-xs font-semibold tracking-wide uppercase">
            {copy}
          </p>
          <CompanyHeader company={company} />
          <h1 className="text-center text-lg font-semibold">{words.title}</h1>
          <ChallanParties challan={challan} />
          <ChallanLines challan={challan} />
          <SignatureBoxes />
        </section>
      ))}
    </div>
  );
}

// Each block stands alone, so a VAT (Mushak 6.3) layout can reuse them.
function CompanyHeader({ company }: { company: Company }) {
  return (
    <header className="grid justify-items-center gap-0.5 text-center">
      <p className="text-xl font-bold">{company.name}</p>
      <p>{company.address}</p>
      <p>{words.phone(company.phone)}</p>
      {company.bin && <p>{words.bin(company.bin)}</p>}
    </header>
  );
}

function ChallanParties({ challan }: { challan: Challan }) {
  const dispatch = text.dispatch;
  const rows: [string, string][] = [
    [words.challanNo, challan.number],
    [dispatch.date, formatDay(challan.dispatchedOn)],
    [dispatch.customer, challan.customerName],
    [dispatch.address, challan.deliveryAddress],
    [dispatch.customerPo, challan.customerPo ?? ''],
    [words.orderNo, challan.orderNumber],
    [dispatch.vehicle, challan.vehicleNumber],
    [
      dispatch.driver,
      `${challan.driverName}, ${formatPhone(challan.driverPhone)}`,
    ],
  ];
  return (
    <dl className="grid grid-cols-[max-content_1fr_max-content_1fr] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChallanLines({ challan }: { challan: Challan }) {
  const dispatch = text.dispatch;
  const cell = 'border border-black px-2 py-1';
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={`${cell} text-left`}>{words.lineNo}</th>
          <th className={`${cell} text-left`}>{words.code}</th>
          <th className={`${cell} text-left`}>{dispatch.product}</th>
          <th className={`${cell} text-right`}>{dispatch.pieces}</th>
          <th className={`${cell} text-right`}>{dispatch.cartons}</th>
        </tr>
      </thead>
      <tbody>
        {challan.lines.map((line, index) => (
          <tr key={line.productId}>
            <td className={cell}>{index + 1}</td>
            <td className={cell}>{line.code}</td>
            <td className={cell}>{line.name}</td>
            <td className={`${cell} text-right tabular-nums`}>
              {formatPieces(line.pieces)}
            </td>
            <td className={`${cell} text-right tabular-nums`}>
              {formatCartons(line.pieces, line.piecesPerCarton)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th colSpan={3} className={`${cell} text-right`}>
            {dispatch.total}
          </th>
          <td className={`${cell} text-right font-semibold tabular-nums`}>
            {formatPieces(totalPieces(challan.lines))}
          </td>
          <td className={cell} />
        </tr>
      </tfoot>
    </table>
  );
}

function SignatureBoxes() {
  return (
    <div className="mt-12 grid grid-cols-3 gap-8">
      {[words.preparedBy, words.gate, words.receivedBy].map((label) => (
        <p key={label} className="border-t border-black pt-1 text-center">
          {label}
        </p>
      ))}
    </div>
  );
}
