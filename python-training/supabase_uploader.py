"""
Supabase Storage Uploader for Trained Models
Handles uploading trained PPO models and metadata to Supabase Storage
and updates the asset_models table with model information.
"""

import os
import json
import requests
from typing import Optional, Dict, Any
from datetime import datetime


def upload_model_to_storage(
    symbol: str,
    user_id: str,
    model_path: str,
    metadata_path: str,
    asset_type: str
) -> Dict[str, Any]:
    """
    Upload trained model and metadata to Supabase Storage
    and update asset_models table
    
    Args:
        symbol: Asset symbol (e.g., BTCUSDT, AAPL)
        user_id: User ID who requested training
        model_path: Local path to final_model.json
        metadata_path: Local path to model_metadata.json
        asset_type: Asset type (Cryptocurrencies, Stocks, or auto-detected)
    
    Returns:
        dict: {
            "success": bool,
            "model_id": str (if success),
            "error": str (if failure)
        }
    """
    
    # Read environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not service_role_key:
        return {
            "success": False,
            "error": "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
        }
    
    try:
        # Load model and metadata files
        with open(model_path, 'r') as f:
            model_weights = json.load(f)
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        print(f"[UPLOAD] Loaded model ({len(json.dumps(model_weights))} bytes) and metadata")
        
        # Determine asset type category for storage path
        asset_category = "crypto" if asset_type == "Cryptocurrencies" else "stock"
        
        # Query existing models to determine version
        print(f"[UPLOAD] Checking existing models for {symbol}...")
        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json"
        }
        
        # Get the latest version for this symbol and user
        query_url = f"{supabase_url}/rest/v1/asset_models"
        query_params = {
            "select": "model_version",
            "user_id": f"eq.{user_id}",
            "symbol": f"eq.{symbol}",
            "order": "model_version.desc",
            "limit": "1"
        }
        
        response = requests.get(query_url, headers=headers, params=query_params)
        existing_models = response.json() if response.ok else []
        new_version = existing_models[0]["model_version"] + 1 if existing_models else 1
        
        print(f"[UPLOAD] New model version will be: v{new_version}")
        
        # Generate storage paths
        timestamp = datetime.utcnow().isoformat().replace(":", "-").replace(".", "-")
        storage_folder = f"{user_id}/{asset_category}/{symbol}"
        model_filename = f"v{new_version}_{timestamp}.json"
        metadata_filename = f"v{new_version}_{timestamp}.meta"
        model_storage_path = f"{storage_folder}/{model_filename}"
        metadata_storage_path = f"{storage_folder}/{metadata_filename}"
        
        print(f"[UPLOAD] Storage paths:")
        print(f"  Model: {model_storage_path}")
        print(f"  Metadata: {metadata_storage_path}")
        
        # Upload model weights to storage
        print(f"[UPLOAD] Uploading model weights...")
        storage_url = f"{supabase_url}/storage/v1/object/trained-models/{model_storage_path}"
        model_data = json.dumps(model_weights, indent=2).encode('utf-8')
        
        upload_response = requests.post(
            storage_url,
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json"
            },
            data=model_data
        )
        
        if not upload_response.ok:
            return {
                "success": False,
                "error": f"Model upload failed: {upload_response.status_code} - {upload_response.text}"
            }
        
        print(f"[UPLOAD] ✅ Model weights uploaded successfully")
        
        # Upload metadata to storage
        print(f"[UPLOAD] Uploading metadata...")
        metadata_url = f"{supabase_url}/storage/v1/object/trained-models/{metadata_storage_path}"
        metadata_data = json.dumps(metadata, indent=2).encode('utf-8')
        
        metadata_response = requests.post(
            metadata_url,
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json"
            },
            data=metadata_data
        )
        
        if not metadata_response.ok:
            print(f"[UPLOAD] ⚠️ Metadata upload failed (non-critical): {metadata_response.text}")
        else:
            print(f"[UPLOAD] ✅ Metadata uploaded successfully")
        
        # Archive old active model if exists
        print(f"[UPLOAD] Archiving old models...")
        archive_url = f"{supabase_url}/rest/v1/asset_models"
        archive_params = {
            "user_id": f"eq.{user_id}",
            "symbol": f"eq.{symbol}",
            "model_status": "eq.active"
        }
        archive_data = {"model_status": "archived"}
        
        requests.patch(
            archive_url,
            headers=headers,
            params=archive_params,
            json=archive_data
        )
        
        # Insert new model record into asset_models table
        print(f"[UPLOAD] Creating database record...")
        insert_url = f"{supabase_url}/rest/v1/asset_models"
        
        # Extract performance metrics from metadata
        performance_metrics = metadata.get("performance_metrics", {})
        
        model_record = {
            "user_id": user_id,
            "symbol": symbol,
            "model_type": "recurrent_ppo",
            "model_architecture": "recurrent_ppo",
            "model_storage_path": model_storage_path,
            "metadata_storage_path": metadata_storage_path,
            "model_version": new_version,
            "model_status": "active",  # GPU-trained models are marked as active
            "hidden_size": metadata.get("hidden_size", 256),
            "sequence_length": metadata.get("sequence_length", 50),
            "training_data_points": metadata.get("training_data_points"),
            "performance_metrics": performance_metrics,
            "action_space": {
                "direction": 3,
                "tp_offset": [-0.5, 0.5],
                "sl_tight": [0.5, 2.0],
                "size": [0.0, 1.0]
            },
            "fine_tuning_metadata": {
                "asset_type": asset_type,
                "trained_on_gpu": True,
                "training_device": metadata.get("device", "unknown"),
                "total_updates": metadata.get("total_updates"),
                "episodes_trained": metadata.get("total_updates")
            }
        }
        
        insert_response = requests.post(
            insert_url,
            headers={**headers, "Prefer": "return=representation"},
            json=model_record
        )
        
        if not insert_response.ok:
            return {
                "success": False,
                "error": f"Database insert failed: {insert_response.status_code} - {insert_response.text}"
            }
        
        inserted_data = insert_response.json()
        model_id = inserted_data[0]["id"] if inserted_data else "unknown"
        
        print(f"[UPLOAD] ✅ Database record created with ID: {model_id}")
        
        return {
            "success": True,
            "model_id": model_id,
            "version": new_version,
            "storage_path": model_storage_path
        }
        
    except FileNotFoundError as e:
        return {
            "success": False,
            "error": f"Model file not found: {str(e)}"
        }
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Invalid JSON in model or metadata file: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Upload failed: {str(e)}"
        }
