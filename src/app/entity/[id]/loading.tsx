export default function EntityLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="h-8 w-24 bg-[#111827] rounded animate-pulse" />
      <div className="h-32 bg-[#111827] rounded-xl animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-[#111827] rounded-xl animate-pulse" />
        <div className="h-64 bg-[#111827] rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
