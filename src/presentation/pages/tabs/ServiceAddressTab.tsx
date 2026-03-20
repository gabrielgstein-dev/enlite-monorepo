import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { serviceAddressSchema, ServiceAddressFormData } from '@presentation/validation/workerRegistrationSchemas';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { GooglePlacesAutocomplete, AddressField } from '@presentation/components/molecules';
import { DistanceSlider } from '@presentation/components/shared/DistanceSlider';
import { InputWithIcon } from '@presentation/components/molecules';
import { Button } from '@presentation/components/atoms/Button';
import { Checkbox, Typography } from '@presentation/components/atoms';

export function ServiceAddressTab(): JSX.Element {
  const { t } = useTranslation();
  const { saveServiceArea, getProgress } = useWorkerApi();

  // Use individual selectors to prevent re-renders
  const data = useWorkerRegistrationStore((state) => state.data);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [isAddressValid, setIsAddressValid] = useState(!!data.serviceAddress.address); // Se tem endereço na store, já é válido
  const [, setIsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ServiceAddressFormData>({
    resolver: zodResolver(serviceAddressSchema),
    defaultValues: {
      serviceRadius: data.serviceAddress.serviceRadius || 10,
      address: data.serviceAddress.address || '',
      complement: data.serviceAddress.complement || '',
      acceptsRemoteService: data.serviceAddress.acceptsRemoteService || false,
    },
    mode: 'onChange',
  });

  // Buscar dados reais do backend e preencher formulário
  useEffect(() => {
    const fetchWorkerData = async () => {
      try {
        setIsLoading(true);
        const workerData = await getProgress();
        
        if (workerData.serviceAddress) {
          // Preencher formulário com dados do backend
          reset({
            address: workerData.serviceAddress || '',
            complement: workerData.serviceAddressComplement || '', // Usar complemento salvo separadamente
            serviceRadius: workerData.serviceRadiusKm || 10,
            acceptsRemoteService: false,
          });
          
          // Se tem endereço do backend, considera válido
          setIsAddressValid(true);
        }
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkerData();
  }, [getProgress, reset]);

  const handlePlaceSelected = (place: google.maps.places.PlaceResult): void => {
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setCoordinates({ lat, lng });
    }
  };

  const onSubmit = async (formData: ServiceAddressFormData): Promise<void> => {
    if (!isAddressValid) {
      setSaveError(t('validation.selectAddressFromSuggestions'));
      return;
    }

    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      await saveServiceArea({
        address: formData.address,
        addressComplement: formData.complement || undefined,
        serviceRadiusKm: formData.serviceRadius,
        lat: coordinates.lat,
        lng: coordinates.lng,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('workerRegistration.serviceAddress.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 w-full">
      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-input font-lexend text-sm text-green-700">
          {t('profile.saveSuccess', 'Informações salvas com sucesso!')}
        </div>
      )}
      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-input font-lexend text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* Address Fields */}
      <div className="flex flex-col md:flex-row gap-4">
        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <GooglePlacesAutocomplete
              label={t('workerRegistration.serviceAddress.address')}
              containerClassName="w-full md:flex-[2]"
              placeholder={t('workerRegistration.serviceAddress.addressPlaceholder')}
              value={field.value}
              onChange={field.onChange}
              onPlaceSelected={handlePlaceSelected}
              onValidationChange={setIsAddressValid}
              error={errors.address?.message}
              requireSelection={true}
            />
          )}
        />

        <AddressField
          label={t('workerRegistration.serviceAddress.complement')}
          containerClassName="w-full md:flex-1"
          placeholder={t('workerRegistration.serviceAddress.complementPlaceholder')}
          {...register('complement')}
          error={errors.complement?.message}
        />
      </div>

      {/* Service Radius with Slider */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Typography variant="body" weight="medium" color="primary">
            {t('workerRegistration.serviceAddress.serviceRadius')}
          </Typography>
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="serviceRadius"
              render={({ field }) => (
                <>
                  <InputWithIcon
                    id="serviceRadius"
                    type="number"
                    value={field.value}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      // Snap to nearest allowed value
                      const allowed = [5, 10, 20, 50];
                      const nearest = allowed.reduce((prev, curr) => 
                        Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
                      );
                      field.onChange(nearest);
                    }}
                    onBlur={() => {
                      // Ensure value is one of the allowed options
                      const allowed = [5, 10, 20, 50];
                      if (!allowed.includes(field.value)) {
                        const nearest = allowed.reduce((prev, curr) => 
                          Math.abs(curr - field.value) < Math.abs(prev - field.value) ? curr : prev
                        );
                        field.onChange(nearest);
                      }
                    }}
                    className="w-20 text-center"
                  />
                  <Typography variant="body" color="secondary">
                    {t('workerRegistration.serviceAddress.km')}
                  </Typography>
                </>
              )}
            />
          </div>
        </div>
        
        {/* Distance Slider */}
        <Controller
          control={control}
          name="serviceRadius"
          render={({ field }) => (
            <DistanceSlider
              value={field.value}
              onChange={(val: number) => field.onChange(val)}
              options={[5, 10, 20, 50]}
            />
          )}
        />
      </div>

      {/* Remote Service Toggle */}
      <div className="flex flex-col gap-4 pt-4">
        <Controller
          control={control}
          name="acceptsRemoteService"
          render={({ field }) => (
            <Checkbox
              id="acceptsRemoteService"
              label={t('workerRegistration.serviceAddress.acceptsRemote')}
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            />
          )}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSaving}
        >
          {t('profile.save', 'Salvar')}
        </Button>
      </div>
    </form>
  );
}
