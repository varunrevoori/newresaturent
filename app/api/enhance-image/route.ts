import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { assetId, url, restaurantId } = body ?? {};

    if (!url) {
      return NextResponse.json({ error: 'Missing image url' }, { status: 400 });
    }

    // Placeholder: queue a job to enhance the image. Will integrate LLM/image API later.
    const jobId = `job_${Date.now()}`;

    return NextResponse.json({ status: 'queued', jobId }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
