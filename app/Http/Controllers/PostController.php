<?php

namespace App\Http\Controllers;

use App\Models\Post;
use Illuminate\Http\Request;

class PostController extends Controller
{
    // Tampilkan semua post
    public function index()
    {
        $posts = Post::latest()->get();

        return view('posts.index', compact('posts'));
    }

    // Form buat post baru
    public function create()
    {
        return view('posts.create');
    }

    // Simpan post baru
    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
        ]);

        Post::create($request->all());

        return redirect()->route('posts.index')->with('success', 'Post berhasil dibuat.');
    }

    // Tampilkan satu post
    public function show(Post $post)
    {
        return view('posts.show', compact('post'));
    }

    // Form edit post
    public function edit(Post $post)
    {
        return view('posts.edit', compact('post'));
    }

    // Update post
    public function update(Request $request, Post $post)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
        ]);

        $post->update($request->all());

        return redirect()->route('posts.index')->with('success', 'Post berhasil diupdate.');
    }

    // Hapus post
    public function destroy(Post $post)
    {
        $post->delete();

        return redirect()->route('posts.index')->with('success', 'Post berhasil dihapus.');
    }
}
