<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Post</title>
</head>
<body>
    <h1>Edit Post</h1>

    <form action="{{ route('posts.update', $post) }}" method="POST">
        @csrf
        @method('PUT')

        <div>
            <label for="title">Judul:</label>
            <input type="text" id="title" name="title" value="{{ old('title', $post->title) }}">
            @error('title')
                <div style="color: red;">{{ $message }}</div>
            @enderror
        </div>

        <div>
            <label for="content">Konten:</label><br>
            <textarea id="content" name="content" rows="8">{{ old('content', $post->content) }}</textarea>
            @error('content')
                <div style="color: red;">{{ $message }}</div>
            @enderror
        </div>

        <button type="submit">Update</button>
    </form>

    <a href="{{ route('posts.index') }}">Kembali</a>
</body>
</html>