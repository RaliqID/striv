<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daftar Post</title>
</head>
<body>
    <h1>Daftar Post</h1>

    @if (session('success'))
        <p style="color: green;">{{ session('success') }}</p>
    @endif

    <a href="{{ route('posts.create') }}">Buat Post Baru</a>

    @forelse ($posts as $post)
        <div style="border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 10px;">
            <h3>
                <a href="{{ route('posts.show', $post) }}">{{ $post->title }}</a>
            </h3>
            <p>{{ \Illuminate\Support\Str::limit($post->content, 100) }}</p>
            <a href="{{ route('posts.edit', $post) }}">Edit</a>
            <form action="{{ route('posts.destroy', $post) }}" method="POST" style="display: inline;">
                @csrf
                @method('DELETE')
                <button type="submit" onclick="return confirm('Yakin hapus post ini?')">Hapus</button>
            </form>
        </div>
    @empty
        <p>Belum ada post.</p>
    @endforelse
</body>
</html>