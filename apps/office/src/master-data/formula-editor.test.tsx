import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { text } from '@/i18n';
import { rawMaterial } from '@/test/fixtures';
import { FormulaEditor } from './formula-editor';

const pp = rawMaterial();
const white = rawMaterial({
  id: '00000000-0000-4000-8000-0000000000a2',
  code: 'MB-WHT-01',
  name: 'White masterbatch',
  type: 'MASTERBATCH',
});
const words = text.formulas;

async function fillIn(shares: [string, string], waste = '3') {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <FormulaEditor
      pieceWeightMg={2_500}
      materials={[pp, white]}
      onSave={onSave}
    />,
  );
  await user.clear(screen.getByLabelText(words.wastePercent));
  await user.type(screen.getByLabelText(words.wastePercent), waste);
  await user.click(screen.getByRole('button', { name: words.addLine }));
  const materials = screen.getAllByLabelText(words.material);
  const percents = screen.getAllByLabelText(words.percent);
  await user.selectOptions(materials[0], pp.id);
  await user.type(percents[0], shares[0]);
  await user.selectOptions(materials[1], white.id);
  await user.type(percents[1], shares[1]);
  return { user, onSave, percents };
}

describe('FormulaEditor', () => {
  it('keeps Save off until the lines add up to exactly 100.00%', async () => {
    const { user, percents } = await fillIn(['98', '1.5']);
    const save = screen.getByRole('button', { name: words.save });

    expect(screen.getByTestId('formula-total').textContent).toBe(
      'Total 99.50%',
    );
    expect(save).toHaveProperty('disabled', true);
    expect(screen.getByText(words.mustBe100)).toBeTruthy();
    expect(screen.queryByTestId('formula-preview')).toBeNull();

    await user.clear(percents[1]);
    await user.type(percents[1], '2');

    expect(screen.getByTestId('formula-total').textContent).toBe(
      'Total 100.00%',
    );
    expect(save).toHaveProperty('disabled', false);
  });

  it('previews what 1000 pieces need, waste included, as the API would', async () => {
    await fillIn(['98', '2']);

    // 1000 x 2.5 g x 1.03 = 2575 g. Split 98/2 that is 2523.5 and 51.5;
    // the odd gram goes to the earlier line, as in the API.
    const preview = screen.getByTestId('formula-preview');
    expect(preview.textContent).toContain('1000 pcs need, with 3.00% waste:');
    expect(preview.textContent).toContain('RM-PP-012.524 kg');
    expect(preview.textContent).toContain('MB-WHT-010.051 kg');
    expect(preview.textContent).toContain('Total2.575 kg');
  });

  it('saves the shares and waste in basis points', async () => {
    const { user, onSave } = await fillIn(['97.5', '2.5'], '3.25');

    await user.click(screen.getByRole('button', { name: words.save }));

    expect(onSave).toHaveBeenCalledWith({
      wasteBasisPoints: 325,
      lines: [
        { rawMaterialId: pp.id, basisPoints: 9_750 },
        { rawMaterialId: white.id, basisPoints: 250 },
      ],
    });
  });
});
