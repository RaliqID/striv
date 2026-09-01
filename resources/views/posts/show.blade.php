<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $post->title }}</title>
</head>
<body>
    <h1>{{ $post->title }}</h1>
    <p>{{ nl2br(e($post->content)) }}</p>

    <a href="{{ route('posts.edit', $post) }}">Edit</a>
    <a href="{{ route('posts.index') }}">Kembali</a>
</body>
</html>