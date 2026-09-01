<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Buat Post Baru</title>
</head>
<body>
    <h1>Buat Post Baru</h1>

    <form action="{{ route('posts.store') }}" method="POST">
        @csrf

        <div>
            <label for="title">Judul:</label>
            <input type="text" id="title" name="title" value="{{ old('title') }}">
            @error('title')
                <div style="color: red;">{{ $message }}</div>
            @enderror
        </div>

        <div>
            <label for="content">Konten:</label><br>
            <textarea id="content" name="content" rows="8">{{ old('content') }}</textarea>
            @error('content')
                <div style="color: red;">{{ $message }}</div>
            @enderror
        </div>

        <button type="submit">Simpan</button>
    </form>

    <a href="{{ route('posts.index') }}">Kembali</a>
</body>
</html>