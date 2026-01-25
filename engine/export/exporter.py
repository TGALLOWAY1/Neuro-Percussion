import zipfile
import io
import json
from datetime import datetime
from engine.instruments.kick import KickEngine
from engine.instruments.snare import SnareEngine
from engine.instruments.hat import HatEngine
from engine.core.io import AudioIO

class Exporter:
    @staticmethod
    def create_kit_zip(kit_data: dict) -> bytes:
        """
        kit_data: {
          'name': 'MyKit', 
          'slots': {
             'kick': { 'params': {...}, 'seed': 123 },
             'snare': { 'params': {...}, 'seed': 456 },
             ...
          }
        }
        """
        buffer = io.BytesIO()
        
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Metadata
            meta = {
                "kit_name": kit_data.get('name', 'NeuroKit'),
                "created_at": datetime.now().isoformat(),
                "slots": kit_data.get('slots')
            }
            zip_file.writestr("kit_info.json", json.dumps(meta, indent=2))
            
            # Render and Save Audio
            slots = kit_data.get('slots', {})
            
            for inst_name, data in slots.items():
                params = data.get('params')
                seed = data.get('seed', 0)
                
                audio = None
                if inst_name == 'kick':
                    audio = KickEngine(48000).render(params, seed)
                elif inst_name == 'snare':
                    audio = SnareEngine(48000).render(params, seed)
                elif inst_name == 'hat':
                    audio = HatEngine(48000).render(params, seed)
                    
                if audio is not None:
                     # Get WAV bytes
                     wav_io = io.BytesIO()
                     AudioIO.save_wav(audio, 48000, wav_io) # Need to adapt save_wav to take file-like obj
                     # Adapted logic below since AudioIO.save_wav takes path str currently
                     # Re-using internal numpy conversion logic
                     wav_bytes = AudioIO.to_bytes(audio, 48000)
                     zip_file.writestr(f"{inst_name}.wav", wav_bytes)
                     
        return buffer.getvalue()
