import Link from "next/link";

export default function EntityNotFound() {
  return (
    <div className="text-center py-20">
      <h2 className="text-xl font-bold text-white mb-2">Entity not found</h2>
      <p className="text-gray-400 mb-4">The AI model or tool you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="text-blue-400 hover:underline">
        &larr; Back to rankings
      </Link>
    </div>
  );
}
