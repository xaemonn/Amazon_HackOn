import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiAddJudgeProduct, type JudgeProductResult } from '../api/client';
import './JudgePage.css';

export function JudgePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JudgeProductResult | null>(null);

  // Only the Judge login may use this harness.
  if (!user?.isJudge) {
    return (
      <section className="judge">
        <h1 className="judge__title">Judge Test Harness</h1>
        <p className="judge__locked">
          This tool is only available on the <strong>Judge login</strong>.{' '}
          <Link to="/login">Sign in with the Judge account</Link> to add a test product.
        </p>
      </section>
    );
  }

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).slice(0, 3);
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Please enter a product name.'); return; }
    if (files.length === 0) { setError('Please add at least one product image.'); return; }
    setSubmitting(true);
    try {
      const res = await apiAddJudgeProduct(name.trim(), files);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add product.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <section className="judge">
        <div className="judge__success">
          <div className="judge__success-icon" aria-hidden="true">✅</div>
          <h1 className="judge__title">Product added!</h1>
          <p className="judge__success-text">
            <strong>{result.productName}</strong> is now in your orders with{' '}
            {result.catalogImageRefs.length} reference image{result.catalogImageRefs.length !== 1 ? 's' : ''}.
            Open Your Orders, hit <strong>Return item</strong>, and upload return photos —
            the AI will grade them against the exact images you just provided.
          </p>
          <div className="judge__success-actions">
            <button className="judge__btn judge__btn--primary" onClick={() => navigate('/orders')}>
              Go to Your Orders → test the return
            </button>
            <button
              className="judge__btn judge__btn--ghost"
              onClick={() => { setResult(null); setName(''); setFiles([]); setPreviews([]); }}
            >
              Add another product
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="judge">
      <header className="judge__header">
        <h1 className="judge__title">🧑‍⚖️ Judge Test Harness</h1>
        <p className="judge__subtitle">
          Add any product with its real photos, then test the full return → AI-grading flow.
          The images you upload here become the product's catalog reference set — your
          return photos are compared against them.
        </p>
      </header>

      <form className="judge__form" onSubmit={handleSubmit}>
        <label className="judge__field">
          <span className="judge__label">Product name</span>
          <input
            className="judge__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sony WH-1000XM5 Headphones"
            maxLength={80}
          />
        </label>

        <label className="judge__field">
          <span className="judge__label">Reference images (up to 3 — front, back, close-up)</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="judge__file"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {previews.length > 0 && (
          <div className="judge__previews">
            {previews.map((src, i) => (
              <img key={i} src={src} alt={`Reference ${i + 1}`} className="judge__preview" />
            ))}
          </div>
        )}

        {error && <p className="judge__error" role="alert">{error}</p>}

        <button type="submit" className="judge__btn judge__btn--primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add product & create test order'}
        </button>
      </form>
    </section>
  );
}
