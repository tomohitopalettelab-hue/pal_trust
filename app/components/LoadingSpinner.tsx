type LoadingSpinnerProps = {
  fullScreen?: boolean;
};

export default function LoadingSpinner({ fullScreen = true }: LoadingSpinnerProps) {
  return (
    <div className={fullScreen ? 'min-h-screen flex items-center justify-center' : 'flex items-center justify-center'}>
      <div className="w-14 h-14 rounded-full border-[length:var(--theme-bw)] border-[var(--theme-primary)] border-t-transparent animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
