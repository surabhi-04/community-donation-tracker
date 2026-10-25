import { useState } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { useToast } from '../contexts/ToastContext';
import type { Person } from '../types';
import { formatINR, parseAndValidateAmount, isPersonDonor } from '../types';

export interface RecordDonationModalProps {
  person: Person;
  mode?: 'record' | 'edit' | 'convert';
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RecordDonationModal({
  person,
  mode = 'record',
  onClose,
  onSuccess,
}: RecordDonationModalProps) {
  const { recordDonation, editDonationAmount, convertInviterToDonor } = useTeam();
  const { showToast } = useToast();

  const isConverting = mode === 'convert' || !isPersonDonor(person);
  const isEditingAmount = mode === 'edit';

  const [amountStr, setAmountStr] = useState<string>(() => {
    if (isEditingAmount && typeof person.amount === 'number' && person.amount > 0) {
      return String(person.amount);
    }
    return '';
  });

  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const prevContributions = person.contributions || [];
  const hasPriorDonations = (typeof person.amount === 'number' && person.amount > 0) || prevContributions.length > 0;

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const validation = parseAndValidateAmount(amountStr);
    if (!validation.valid || typeof validation.value !== 'number') {
      setError(validation.error || 'Please enter a valid donation amount in INR (₹)');
      return;
    }

    setSaving(true);
    try {
      if (isConverting) {
        await convertInviterToDonor(person.id, validation.value, note);
        showToast(
          `${person.fullName} is now a Donor with ${formatINR(validation.value)} recorded!`,
          'success'
        );
      } else if (isEditingAmount) {
        await editDonationAmount(person.id, validation.value, note);
        showToast(
          `Donation amount updated to ${formatINR(validation.value)} for ${person.fullName}`,
          'success'
        );
      } else {
        await recordDonation(person.id, validation.value, note);
        showToast(
          `Recorded ${formatINR(validation.value)} donation from ${person.fullName}!`,
          'success'
        );
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      console.error('Error saving donation:', err);
      const msg = err instanceof Error ? err.message : 'Failed to record donation. Please try again.';
      setError(msg);
      setSaving(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className="bottom-sheet"
        style={{
          maxHeight: '85vh',
          overflowY: 'auto',
          maxWidth: '30rem',
          margin: '0 auto',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--surface-container)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--secondary)' }}>
                {isConverting ? 'person_add' : 'payments'}
              </span>
              <span className="text-label-sm" style={{ color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                {isConverting ? 'Donor Conversion' : isEditingAmount ? 'Edit Amount' : 'Collection Record'}
              </span>
            </div>
            <h3 className="text-headline-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>
              {isConverting ? 'Mark as Donor & Record Donation' : isEditingAmount ? 'Edit Donation Amount' : 'Record Donation Received'}
            </h3>
            <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>
              For <strong>{person.fullName}</strong> {person.group ? `(${person.group})` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', padding: 4 }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Existing Contributions Summary (if repeat donation) */}
        {!isEditingAmount && hasPriorDonations && (
          <div style={{
            background: 'var(--secondary-fixed)',
            padding: '0.75rem 0.875rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            border: '1px solid rgba(0, 108, 78, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="text-label-sm" style={{ color: 'var(--on-secondary-fixed-variant)', fontWeight: 600 }}>
                Previous Total Donated:
              </span>
              <span style={{ fontWeight: 800, color: 'var(--secondary)' }}>
                {formatINR(person.amount, { showZero: true })}
              </span>
            </div>
            <p className="text-label-sm" style={{ color: 'var(--on-secondary-fixed-variant)', marginTop: '0.25rem' }}>
              Entering an amount below will add a new contribution to their record.
            </p>
          </div>
        )}

        {isConverting && (
          <div style={{
            background: 'var(--accent-blue-bg)',
            border: '1.5px solid var(--accent-blue-border)',
            padding: '0.625rem 0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}>
            <p className="text-label-sm" style={{ color: 'var(--accent-blue-text)', margin: 0 }}>
              💡 <strong>{person.fullName}</strong> will be added to the Donor list while retaining their invitation status and group assignment without creating duplicate records.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label" htmlFor="donation-amount">
              Amount Donated (₹) *
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontWeight: 700,
                fontSize: '1.125rem',
                color: 'var(--on-surface)',
              }}>
                ₹
              </span>
              <input
                id="donation-amount"
                type="number"
                step="any"
                min="1"
                className="form-input"
                style={{ paddingLeft: '2.25rem', fontSize: '1.125rem', fontWeight: 600 }}
                placeholder="e.g. 500"
                value={amountStr}
                onChange={(e) => handleAmountChange(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && (
              <p className="form-error" style={{ marginTop: '0.375rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                <span>{error}</span>
              </p>
            )}
            <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.375rem' }}>
              Enter positive monetary amount in INR. Decimals (paise) are supported.
            </p>
          </div>

          <div>
            <label className="form-label" htmlFor="donation-note">
              Payment Note / Reference (optional)
            </label>
            <input
              id="donation-note"
              type="text"
              className="form-input"
              placeholder="e.g. Cash, GPay / UPI, Cheque #1234"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Quick presets for convenience */}
          <div>
            <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
              Quick amounts (₹):
            </span>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {[250, 500, 1000, 2000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: '2rem', padding: '0 0.625rem', fontSize: 12, borderRadius: 4 }}
                  onClick={() => handleAmountChange(String(preset))}
                >
                  ₹{preset}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ flex: 1, height: '2.75rem' }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1.5, height: '2.75rem', gap: 6 }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                  <span>{isEditingAmount ? 'Update Amount' : isConverting ? 'Convert & Record' : 'Record Donation'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
