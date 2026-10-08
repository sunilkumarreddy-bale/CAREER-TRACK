export default function Spinner({ size = 20 }) {
  return <span className="spinner" style={{ width: size, height: size }} role="progressbar" aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <Spinner size={32} />
    </div>
  );
}
