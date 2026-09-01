<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    // Define fields that can be populated through your controller's store/update methods
    protected $fillable = ['title', 'content'];
}
