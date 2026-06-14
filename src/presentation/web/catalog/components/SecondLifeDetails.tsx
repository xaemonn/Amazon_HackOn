import './SecondLifeDetails.css';

export interface UnitPhoto {
  id: string;
  url: string;
}

export interface SecondLifeDetailsProps {
  sourceReturnId?: string;
  conditionReport?: string;
  unitPhotos?: UnitPhoto[];
}

export function SecondLifeDetails({
  sourceReturnId,
  conditionReport,
  unitPhotos,
}: SecondLifeDetailsProps) {
  if (!sourceReturnId) {
    return null;
  }

  const visiblePhotos = unitPhotos?.slice(0, 5) ?? [];

  return (
    <div className="second-life-details" aria-label="Second Life product details">
      <div className="second-life-details__badge" aria-label="Second Life item">
        <svg
          className="second-life-details__badge-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9" />
        </svg>
        <span className="second-life-details__badge-text">Second Life</span>
      </div>

      {conditionReport && (
        <div className="second-life-details__report">
          <h4 className="second-life-details__report-title">Condition Report</h4>
          <p className="second-life-details__report-text">{conditionReport}</p>
        </div>
      )}

      {visiblePhotos.length > 0 && (
        <div className="second-life-details__photos" aria-label="Actual unit photos">
          <h4 className="second-life-details__photos-title">Actual Unit Photos</h4>
          <div className="second-life-details__photos-grid">
            {visiblePhotos.map((photo) => (
              <img
                key={photo.id}
                className="second-life-details__photo"
                src={photo.url}
                alt={`Actual unit photo`}
                loading="lazy"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
